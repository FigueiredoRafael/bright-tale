/**
 * POST /api/wordpress/publish
 * Publish a project to WordPress with image upload and placeholder replacement
 */
import { NextRequest, NextResponse } from "next/server";
import { publishToWordPressSchema } from "@brighttale/shared/schemas/wordpress";
import { markdownToHtml } from "@/lib/utils";
import yaml from "js-yaml";
import {
  handleApiError,
  createSuccessResponse,
  ApiError,
} from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { createServiceClient } from '@/lib/supabase';
import { decrypt } from "@/lib/crypto";

export async function POST(request: NextRequest) {
  try {
    const sb = createServiceClient();
    const body = await validateBody(request, publishToWordPressSchema);

    // Get the project with its production stage
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('*')
      .eq('id', body.project_id)
      .maybeSingle();

    if (projErr) throw projErr;

    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    // Get the latest production stage
    const { data: stages, error: stageErr } = await sb
      .from('stages')
      .select('*')
      .eq('project_id', body.project_id)
      .eq('stage_type', 'production')
      .order('version', { ascending: false })
      .limit(1);

    if (stageErr) throw stageErr;

    if (!stages || stages.length === 0) {
      throw new ApiError(400, "No production content found for this project");
    }

    // Parse production YAML to get blog content
    const productionStage = stages[0];
    const yamlContent = productionStage.yaml_artifact;
    const productionData = yaml.load(yamlContent) as any;

    const blogContent =
      productionData?.production_output?.blog || productionData?.blog || null;

    if (!blogContent || !blogContent.full_draft) {
      throw new ApiError(400, "No blog content found in production stage");
    }

    // Get WordPress credentials
    let site_url: string;
    let username: string;
    let password: string;

    if (body.config_id) {
      // Use stored config
      const { data: config, error: cfgErr } = await sb
        .from('wordpress_configs')
        .select('*')
        .eq('id', body.config_id)
        .maybeSingle();

      if (cfgErr) throw cfgErr;

      if (!config) {
        throw new ApiError(404, "WordPress config not found");
      }

      site_url = config.site_url;
      username = config.username;
      password = decrypt(config.password);
    } else if (body.site_url && body.username && body.password) {
      // Use provided credentials
      site_url = body.site_url;
      username = body.username;
      password = body.password;
    } else {
      throw new ApiError(
        400,
        "Either config_id or site_url/username/password must be provided",
      );
    }

    // Create Basic Auth header
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const headers = {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    };

    // Get all project assets for image replacement
    const { data: assets, error: assetsErr } = await sb
      .from('assets')
      .select('*')
      .eq('project_id', body.project_id);

    if (assetsErr) throw assetsErr;

    // Upload featured image to WordPress if specified
    let featuredMediaId: number | null = null;
    if (body.featured_image_asset_id) {
      const featuredAsset = (assets ?? []).find(
        a => a.id === body.featured_image_asset_id,
      );
      if (featuredAsset) {
        featuredMediaId = await uploadImageToWordPress(
          featuredAsset.source_url ?? "",
          featuredAsset.alt_text || blogContent.title,
          site_url,
          auth,
        );

        // Update asset with WordPress media ID
        await sb
          .from('assets')
          .update({ wordpress_id: featuredMediaId })
          .eq('id', featuredAsset.id);
      }
    }

    // Process blog content and replace image placeholders
    let processedContent = blogContent.full_draft;
    const imagePlaceholderRegex = /<!--\s*IMAGE:([a-z0-9]+)\s*-->/gi;
    const matches = [...processedContent.matchAll(imagePlaceholderRegex)];

    for (const match of matches) {
      const [fullMatch, assetId] = match;
      const asset = (assets ?? []).find(a => a.id === assetId);

      if (asset) {
        // Upload image to WordPress if not already uploaded
        let wpMediaId = asset.wordpress_id;
        if (!wpMediaId) {
          wpMediaId = await uploadImageToWordPress(
            asset.source_url ?? "",
            asset.alt_text || "",
            site_url,
            auth,
          );

          // Update asset with WordPress media ID
          await sb
            .from('assets')
            .update({ wordpress_id: wpMediaId })
            .eq('id', asset.id);
        }

        // Get WordPress media details to get URL
        const mediaResponse = await fetch(
          `${site_url}/wp-json/wp/v2/media/${wpMediaId}`,
          { headers },
        );
        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json();
          const imgTag = `<img src="${mediaData.source_url}" alt="${asset.alt_text || ""}" class="wp-image-${wpMediaId}" />`;

          // Update asset with WordPress URL
          await sb
            .from('assets')
            .update({ wordpress_url: mediaData.source_url })
            .eq('id', asset.id);

          // Replace placeholder with img tag
          processedContent = processedContent.replace(fullMatch, imgTag);
        }
      }
    }

    // Convert markdown to HTML for WordPress Classic Editor
    const htmlContent = markdownToHtml(processedContent);

    // Resolve categories (create if needed)
    const categoryIds = await resolveCategories(
      body.categories || [],
      site_url,
      headers,
    );

    // Resolve tags (create if needed)
    const tagIds = await resolveTags(body.tags || [], site_url, headers);

    // Prepare WordPress post data
    const postData: Record<string, unknown> = {
      title: blogContent.title,
      slug: blogContent.slug,
      content: htmlContent,
      excerpt: blogContent.meta_description,
      status: body.status,
    };

    if (categoryIds.length > 0) {
      postData.categories = categoryIds;
    }

    if (tagIds.length > 0) {
      postData.tags = tagIds;
    }

    if (featuredMediaId) {
      postData.featured_media = featuredMediaId;
    }

    // Publish to WordPress
    const response = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        response.status,
        `WordPress publish failed: ${errorText || response.statusText}`,
      );
    }

    const wordpressPost = await response.json();

    // Update project status
    await sb
      .from('projects')
      .update({
        status: body.status === "publish" ? "completed" : project.status,
      })
      .eq('id', body.project_id);

    return NextResponse.json(
      createSuccessResponse({
        published: true,
        wordpress_post_id: wordpressPost.id,
        wordpress_url: wordpressPost.link,
        status: wordpressPost.status,
        message: "Successfully published to WordPress",
      }),
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

// Helper: Upload image to WordPress Media Library
async function uploadImageToWordPress(
  imageUrl: string,
  altText: string,
  siteUrl: string,
  auth: string,
): Promise<number> {
  // Download image from URL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new ApiError(400, "Failed to download image from source URL");
  }

  const imageBlob = await imageResponse.blob();
  const arrayBuffer = await imageBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Get filename from URL or generate one
  const urlParts = imageUrl.split("/");
  const filename = urlParts[urlParts.length - 1].split("?")[0] || "image.jpg";

  // Upload to WordPress
  const uploadResponse = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": imageBlob.type || "image/jpeg",
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new ApiError(
      uploadResponse.status,
      `Failed to upload image to WordPress: ${errorText}`,
    );
  }

  const mediaData = await uploadResponse.json();

  // Set alt text
  if (altText) {
    await fetch(`${siteUrl}/wp-json/wp/v2/media/${mediaData.id}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alt_text: altText }),
    });
  }

  return mediaData.id;
}

// Helper: Resolve categories (fetch existing or create new)
async function resolveCategories(
  categoryNames: string[] | string | undefined,
  siteUrl: string,
  headers: Record<string, string>,
): Promise<number[]> {
  // Normalize input to array
  const names = Array.isArray(categoryNames)
    ? categoryNames
    : typeof categoryNames === 'string'
      ? [categoryNames]
      : [];

  if (names.length === 0) return [];

  console.log(`[WP Publish] Resolving categories: ${names.join(", ")}`);

  try {
    // Fetch existing categories (up to 100 for now, should be enough for most blogs)
    const response = await fetch(
      `${siteUrl}/wp-json/wp/v2/categories?per_page=100`,
      { headers },
    );

    if (!response.ok) {
      console.error(`[WP Publish] Failed to fetch existing categories: ${response.status} ${response.statusText}`);
    }

    const existingCategories = response.ok ? await response.json() : [];
    const categoryIds: number[] = [];

    for (const name of names) {
      if (!name || typeof name !== 'string') continue;

      const trimmedName = name.trim();
      if (!trimmedName) continue;

      const existing = existingCategories.find(
        (c: any) => c.name.toLowerCase() === trimmedName.toLowerCase(),
      );

      if (existing) {
        console.log(`[WP Publish] Found existing category: ${trimmedName} (ID: ${existing.id})`);
        categoryIds.push(existing.id);
      } else {
        // Create new category
        console.log(`[WP Publish] Creating new category: ${trimmedName}`);
        const createResponse = await fetch(
          `${siteUrl}/wp-json/wp/v2/categories`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ name: trimmedName }),
          },
        );

        if (createResponse.ok) {
          const newCategory = await createResponse.json();
          console.log(`[WP Publish] Successfully created category: ${trimmedName} (ID: ${newCategory.id})`);
          categoryIds.push(newCategory.id);
        } else {
          const errorData = await createResponse.json().catch(() => ({}));
          console.error(`[WP Publish] Failed to create category "${trimmedName}":`, errorData);
        }
      }
    }

    return categoryIds;
  } catch (error) {
    console.error("[WP Publish] Error in resolveCategories:", error);
    return [];
  }
}

// Helper: Resolve tags (fetch existing or create new)
async function resolveTags(
  tagNames: string[] | string | undefined,
  siteUrl: string,
  headers: Record<string, string>,
): Promise<number[]> {
  // Normalize input to array
  const names = Array.isArray(tagNames)
    ? tagNames
    : typeof tagNames === 'string'
      ? [tagNames]
      : [];

  if (names.length === 0) return [];

  console.log(`[WP Publish] Resolving tags: ${names.join(", ")}`);

  try {
    // Fetch existing tags (up to 100 for now)
    const response = await fetch(`${siteUrl}/wp-json/wp/v2/tags?per_page=100`, {
      headers,
    });

    if (!response.ok) {
      console.error(`[WP Publish] Failed to fetch existing tags: ${response.status} ${response.statusText}`);
    }

    const existingTags = response.ok ? await response.json() : [];
    const tagIds: number[] = [];

    for (const name of names) {
      if (!name || typeof name !== 'string') continue;

      const trimmedName = name.trim();
      if (!trimmedName) continue;

      const existing = existingTags.find(
        (t: any) => t.name.toLowerCase() === trimmedName.toLowerCase(),
      );

      if (existing) {
        console.log(`[WP Publish] Found existing tag: ${trimmedName} (ID: ${existing.id})`);
        tagIds.push(existing.id);
      } else {
        // Create new tag
        console.log(`[WP Publish] Creating new tag: ${trimmedName}`);
        const createResponse = await fetch(`${siteUrl}/wp-json/wp/v2/tags`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name: trimmedName }),
        });

        if (createResponse.ok) {
          const newTag = await createResponse.json();
          console.log(`[WP Publish] Successfully created tag: ${trimmedName} (ID: ${newTag.id})`);
          tagIds.push(newTag.id);
        } else {
          const errorData = await createResponse.json().catch(() => ({}));
          console.error(`[WP Publish] Failed to create tag "${trimmedName}":`, errorData);
        }
      }
    }

    return tagIds;
  } catch (error) {
    console.error("[WP Publish] Error in resolveTags:", error);
    return [];
  }
}
