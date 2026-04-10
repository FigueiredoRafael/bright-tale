/**
 * Blog Draft API - Individual operations
 * GET    /api/blogs/[id] - Get a specific blog draft
 * PUT    /api/blogs/[id] - Update a blog draft
 * DELETE /api/blogs/[id] - Delete a blog draft
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { z } from "zod";
import type { BlogOutput } from "@/types/agents";

// Update schema
const updateBlogSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: z.string().min(1).max(200).optional(),
  meta_description: z.string().optional(),
  full_draft: z.string().optional(),
  outline: z
    .array(
      z.object({
        h2: z.string(),
        key_points: z.array(z.string()).default([]),
        word_count_target: z.number().default(300),
      }),
    )
    .optional(),
  primary_keyword: z.string().optional(),
  secondary_keywords: z.array(z.string()).optional(),
  affiliate_integration: z
    .object({
      placement: z.enum(["intro", "middle", "conclusion"]).optional(),
      copy: z.string().optional(),
      product_link_placeholder: z.string().optional(),
      rationale: z.string().optional(),
    })
    .optional(),
  internal_links_suggested: z
    .array(
      z.object({
        topic: z.string(),
        anchor_text: z.string(),
      }),
    )
    .optional(),
  word_count: z.number().optional(),
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().nullable().optional(),
  idea_id: z.string().nullable().optional(),
  wordpress_post_id: z.number().nullable().optional(),
  wordpress_url: z.string().nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    const blog = await prisma.blogDraft.findUnique({
      where: { id },
    });

    if (!blog) {
      return NextResponse.json(createErrorResponse("Blog not found", 404), {
        status: 404,
      });
    }

    // Transform to BlogOutput format
    const blogOutput: BlogOutput = {
      title: blog.title,
      slug: blog.slug,
      meta_description: blog.meta_description,
      full_draft: blog.full_draft,
      outline: blog.outline_json ? JSON.parse(blog.outline_json) : [],
      primary_keyword: blog.primary_keyword || "",
      secondary_keywords: blog.secondary_keywords,
      affiliate_integration: {
        placement:
          (blog.affiliate_placement as "intro" | "middle" | "conclusion") ||
          "middle",
        copy: blog.affiliate_copy || "",
        product_link_placeholder: blog.affiliate_link || "",
        rationale: blog.affiliate_rationale || "",
      },
      internal_links_suggested: blog.internal_links_json
        ? JSON.parse(blog.internal_links_json)
        : [],
      word_count: blog.word_count,
    };

    return createSuccessResponse({
      blog: {
        id: blog.id,
        ...blogOutput,
        status: blog.status,
        project_id: blog.project_id,
        idea_id: blog.idea_id,
        wordpress_post_id: blog.wordpress_post_id,
        wordpress_url: blog.wordpress_url,
        published_at: blog.published_at,
        created_at: blog.created_at,
        updated_at: blog.updated_at,
      },
    });
  } catch (error) {
    console.error("Failed to get blog:", error);
    return NextResponse.json(createErrorResponse("Failed to get blog", 500), {
      status: 500,
    });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data = updateBlogSchema.parse(body);

    // Check if blog exists
    const existing = await prisma.blogDraft.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(createErrorResponse("Blog not found", 404), {
        status: 404,
      });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.meta_description !== undefined)
      updateData.meta_description = data.meta_description;
    if (data.full_draft !== undefined) updateData.full_draft = data.full_draft;
    if (data.outline !== undefined)
      updateData.outline_json = JSON.stringify(data.outline);
    if (data.primary_keyword !== undefined)
      updateData.primary_keyword = data.primary_keyword;
    if (data.secondary_keywords !== undefined)
      updateData.secondary_keywords = data.secondary_keywords;
    if (data.word_count !== undefined) updateData.word_count = data.word_count;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.project_id !== undefined) updateData.project_id = data.project_id;
    if (data.idea_id !== undefined) updateData.idea_id = data.idea_id;
    if (data.wordpress_post_id !== undefined)
      updateData.wordpress_post_id = data.wordpress_post_id;
    if (data.wordpress_url !== undefined)
      updateData.wordpress_url = data.wordpress_url;
    if (data.published_at !== undefined) {
      updateData.published_at = data.published_at
        ? new Date(data.published_at)
        : null;
    }

    // Handle affiliate integration
    if (data.affiliate_integration) {
      if (data.affiliate_integration.placement !== undefined) {
        updateData.affiliate_placement = data.affiliate_integration.placement;
      }
      if (data.affiliate_integration.copy !== undefined) {
        updateData.affiliate_copy = data.affiliate_integration.copy;
      }
      if (data.affiliate_integration.product_link_placeholder !== undefined) {
        updateData.affiliate_link =
          data.affiliate_integration.product_link_placeholder;
      }
      if (data.affiliate_integration.rationale !== undefined) {
        updateData.affiliate_rationale = data.affiliate_integration.rationale;
      }
    }

    // Handle internal links
    if (data.internal_links_suggested !== undefined) {
      updateData.internal_links_json = JSON.stringify(
        data.internal_links_suggested,
      );
    }

    const blog = await prisma.blogDraft.update({
      where: { id },
      data: updateData,
    });

    return createSuccessResponse({ blog });
  } catch (error) {
    console.error("Failed to update blog:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse(
          "Validation failed: " + error.issues.map(e => e.message).join(", "),
          400,
        ),
        { status: 400 },
      );
    }
    return NextResponse.json(
      createErrorResponse("Failed to update blog", 500),
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    // Check if blog exists
    const existing = await prisma.blogDraft.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(createErrorResponse("Blog not found", 404), {
        status: 404,
      });
    }

    await prisma.blogDraft.delete({ where: { id } });

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    console.error("Failed to delete blog:", error);
    return NextResponse.json(
      createErrorResponse("Failed to delete blog", 500),
      { status: 500 },
    );
  }
}
