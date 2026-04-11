/**
 * Blog Library API
 * GET  /api/blogs - List all blog drafts
 * POST /api/blogs - Create a new blog draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from '@/lib/supabase';
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
    const sb = createServiceClient();
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse(Object.fromEntries(searchParams));

    const { status, project_id, idea_id, search, page, limit } = query;

    let countQuery = sb.from('blog_drafts').select('*', { count: 'exact', head: true });
    let dataQuery = sb.from('blog_drafts').select('id, title, slug, meta_description, word_count, status, primary_keyword, project_id, idea_id, wordpress_post_id, wordpress_url, published_at, created_at, updated_at');

    if (status) {
      countQuery = countQuery.eq('status', status);
      dataQuery = dataQuery.eq('status', status);
    }
    if (project_id) {
      countQuery = countQuery.eq('project_id', project_id);
      dataQuery = dataQuery.eq('project_id', project_id);
    }
    if (idea_id) {
      countQuery = countQuery.eq('idea_id', idea_id);
      dataQuery = dataQuery.eq('idea_id', idea_id);
    }
    if (search) {
      const searchFilter = `title.ilike.%${search}%,slug.ilike.%${search}%,primary_keyword.ilike.%${search}%`;
      countQuery = countQuery.or(searchFilter);
      dataQuery = dataQuery.or(searchFilter);
    }

    const [{ count: total, error: countErr }, { data: blogs, error: dataErr }] = await Promise.all([
      countQuery,
      dataQuery
        .order('updated_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
    ]);

    if (countErr) throw countErr;
    if (dataErr) throw dataErr;

    return createSuccessResponse({
      blogs,
      pagination: {
        page,
        limit,
        total: total ?? 0,
        total_pages: Math.ceil((total ?? 0) / limit),
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
    const sb = createServiceClient();
    const body = await request.json();
    const data = createBlogSchema.parse(body);

    const { data: blog, error } = await sb.from('blog_drafts').insert({
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
    }).select().single();

    if (error) throw error;

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
