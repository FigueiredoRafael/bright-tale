/**
 * Blog Library API
 * GET  /api/blogs - List all blog drafts
 * POST /api/blogs - Create a new blog draft
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSuccessResponse, createErrorResponse } from "@/lib/api/errors";
import { z } from "zod";

// Query schema for listing
const listQuerySchema = z.object({
  status: z.enum(["draft", "review", "approved", "published"]).optional(),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Create schema
const createBlogSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().min(1).max(200),
  meta_description: z.string().default(""),
  full_draft: z.string().default(""),
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
  secondary_keywords: z.array(z.string()).default([]),
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
  word_count: z.number().default(0),
  status: z.enum(["draft", "review", "approved", "published"]).default("draft"),
  project_id: z.string().optional(),
  idea_id: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(searchParams));

    const { status, project_id, idea_id, search, page, limit } = query;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (project_id) where.project_id = project_id;
    if (idea_id) where.idea_id = idea_id;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { primary_keyword: { contains: search, mode: "insensitive" } },
      ];
    }

    // Get total count
    const total = await prisma.blogDraft.count({ where });

    // Get blogs with pagination
    const blogs = await prisma.blogDraft.findMany({
      where,
      orderBy: { updated_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        title: true,
        slug: true,
        meta_description: true,
        word_count: true,
        status: true,
        primary_keyword: true,
        project_id: true,
        idea_id: true,
        wordpress_post_id: true,
        wordpress_url: true,
        published_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    return createSuccessResponse({
      blogs,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to list blogs:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        createErrorResponse("Invalid query parameters", 400),
        { status: 400 },
      );
    }
    return NextResponse.json(createErrorResponse("Failed to list blogs", 500), {
      status: 500,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createBlogSchema.parse(body);

    // Prepare data for database
    const blogData = {
      title: data.title,
      slug: data.slug,
      meta_description: data.meta_description,
      full_draft: data.full_draft,
      outline_json: data.outline ? JSON.stringify(data.outline) : null,
      primary_keyword: data.primary_keyword,
      secondary_keywords: data.secondary_keywords,
      affiliate_placement: data.affiliate_integration?.placement,
      affiliate_copy: data.affiliate_integration?.copy,
      affiliate_link: data.affiliate_integration?.product_link_placeholder,
      affiliate_rationale: data.affiliate_integration?.rationale,
      internal_links_json: data.internal_links_suggested
        ? JSON.stringify(data.internal_links_suggested)
        : null,
      word_count: data.word_count,
      status: data.status,
      project_id: data.project_id,
      idea_id: data.idea_id,
    };

    const blog = await prisma.blogDraft.create({
      data: blogData,
    });

    return createSuccessResponse({ blog }, 201);
  } catch (error) {
    console.error("Failed to create blog:", error);
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
      createErrorResponse("Failed to create blog", 500),
      { status: 500 },
    );
  }
}
