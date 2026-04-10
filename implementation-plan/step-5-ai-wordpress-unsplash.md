# Step 5: AI Abstraction, WordPress Integration, and Unsplash Assets

## Overview

Implement AI provider abstraction layer for flexible multi-AI support, WordPress REST API integration for blog publishing, and Unsplash API for manual image selection with placeholder workflow.

## Features

### AI Provider Abstraction

- **Provider Interface**: Standardized method signatures for all AI providers
- **Multi-provider Support**: OpenAI, Anthropic, local models
- **Database Configuration**: Store API keys and provider settings encrypted
- **Feature Flag**: `AI_ENABLED=false` for manual mode fallback
- **Structured Output**: JSON/YAML generation with schema enforcement
- **Error Handling**: Retry logic, rate limiting, timeout handling

### WordPress Integration

- **Authentication**: Application Password storage (encrypted in database)
- **Connection Test**: Validate credentials and REST API availability
- **Draft Creation**: Convert YAML blog content to Classic Editor HTML
- **Meta Fields**: Populate title, slug, excerpt, categories, tags
- **Category/Tag Hybrid**: Fetch existing + create new via REST API
- **Featured Image**: Upload from Assets stage to WordPress Media Library
- **Image Placeholders**: Replace `<!-- IMAGE:asset-id -->` with `<img>` tags
- **Scheduled Publishing**: Set publish date from Review stage `publish_plan`

### Unsplash Integration

- **API Search**: Search images by `primary_keyword`
- **Grid Display**: Show results with thumbnails and metadata
- **Manual Selection**: User clicks to select featured/content images
- **Asset Storage**: Save selections to database with project relation
- **Placeholder Workflow**: Users manually insert `<!-- IMAGE:asset-id -->` in editor
- **Upload to WordPress**: On publish, upload selected images to Media Library

## Components

### AI Provider Interface

```typescript
// lib/ai/provider.ts
export interface AIProvider {
  name: string;
  generateContent(params: {
    agentType: "discovery" | "production" | "review";
    input: any;
    schema: z.ZodSchema;
  }): Promise<any>;
}
```

### OpenAI Provider Implementation

```typescript
// lib/ai/providers/openai.ts
export class OpenAIProvider implements AIProvider {
  name = "openai";

  async generateContent({ agentType, input, schema }) {
    const prompt = buildPrompt(agentType, input);
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return schema.parse(parsed); // Validate with Zod
  }
}
```

### Anthropic Provider Implementation

```typescript
// lib/ai/providers/anthropic.ts
export class AnthropicProvider implements AIProvider {
  name = "anthropic";

  async generateContent({ agentType, input, schema }) {
    const prompt = buildPrompt(agentType, input);
    const response = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229",
      messages: [{ role: "user", content: prompt }],
    });

    const yamlContent = extractYaml(response.content[0].text);
    const parsed = YAML.parse(yamlContent);
    return schema.parse(parsed);
  }
}
```

### WordPress Client

```typescript
// lib/wordpress/client.ts
export class WordPressClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(config: WordPressConfig) {
    this.baseUrl = config.site_url;
    this.username = config.username;
    this.password = decrypt(config.password);
  }

  async testConnection() {
    const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/users/me`, {
      headers: this.getAuthHeaders(),
    });
    return response.ok;
  }

  async createDraft(content: {
    title: string;
    slug: string;
    content: string;
    excerpt: string;
    categories: string[];
    tags: string[];
    featured_media?: number;
  }) {
    const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { ...this.getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        title: content.title,
        slug: content.slug,
        content: content.content,
        excerpt: content.excerpt,
        categories: await this.resolveCategories(content.categories),
        tags: await this.resolveTags(content.tags),
        featured_media: content.featured_media,
        status: "draft",
      }),
    });

    return response.json();
  }

  async uploadMedia(imageUrl: string, altText: string) {
    // Download image from Unsplash URL
    const imageBlob = await fetch(imageUrl).then(r => r.blob());

    const formData = new FormData();
    formData.append("file", imageBlob);
    formData.append("alt_text", altText);

    const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: formData,
    });

    return response.json();
  }

  async getCategories() {
    const response = await fetch(
      `${this.baseUrl}/wp-json/wp/v2/categories?per_page=100`,
    );
    return response.json();
  }

  async createCategory(name: string) {
    const response = await fetch(`${this.baseUrl}/wp-json/wp/v2/categories`, {
      method: "POST",
      headers: { ...this.getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return response.json();
  }

  private async resolveCategories(categoryNames: string[]) {
    const existing = await this.getCategories();
    const categoryIds = [];

    for (const name of categoryNames) {
      const found = existing.find(
        c => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (found) {
        categoryIds.push(found.id);
      } else {
        const created = await this.createCategory(name);
        categoryIds.push(created.id);
      }
    }

    return categoryIds;
  }

  private getAuthHeaders() {
    const auth = Buffer.from(`${this.username}:${this.password}`).toString(
      "base64",
    );
    return { Authorization: `Basic ${auth}` };
  }
}
```

### Unsplash Client

```typescript
// lib/unsplash/client.ts
export class UnsplashClient {
  private accessKey: string;

  constructor(accessKey: string) {
    this.accessKey = accessKey;
  }

  async search(query: string, perPage = 20) {
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}`,
      { headers: { Authorization: `Client-ID ${this.accessKey}` } },
    );
    return response.json();
  }

  async getPhoto(id: string) {
    const response = await fetch(`https://api.unsplash.com/photos/${id}`, {
      headers: { Authorization: `Client-ID ${this.accessKey}` },
    });
    return response.json();
  }
}
```

## API Endpoints

### AI Generation Endpoints

```typescript
// POST /api/ai/discovery
// Request: { discovery_input, project_id }
// Response: { discovery_output }

// POST /api/ai/production
// Request: { production_input, project_id }
// Response: { production_output }

// POST /api/ai/review
// Request: { review_input, project_id }
// Response: { review_output }
```

### WordPress Endpoints

```typescript
// POST /api/wordpress/config
// Save encrypted WordPress credentials

// POST /api/wordpress/test
// Test WordPress connection

// GET /api/wordpress/categories
// Fetch existing categories

// GET /api/wordpress/tags
// Fetch existing tags

// POST /api/wordpress/publish
// Request: { project_id }
// Response: { wordpress_post_id, url }
```

### Unsplash Endpoints

```typescript
// GET /api/assets/unsplash/search?query=habit+formation&perPage=20
// Response: { results: [...] }

// POST /api/assets
// Request: { project_id, asset_type, source_url, alt_text }
// Response: { asset_id }

// GET /api/assets/:projectId
// Response: { assets: [...] }

// DELETE /api/assets/:id
```

## Workflows

### AI-Assisted Content Generation

```
1. User fills Discovery input form
   ↓
2. User clicks "Generate Ideas (AI)"
   ↓
3. System checks AI_ENABLED flag
   ↓
4. If enabled:
   - Fetch AI provider config from database
   - Build prompt from agent instructions + user input
   - Call provider.generateContent() with schema
   - Validate output with Zod
   - Save to stages table
   - Display in Idea Selection Grid
   ↓
5. If disabled:
   - Show manual YAML editor
   - User pastes/types YAML output
   - Validate with Zod
   - Save to stages table
```

### WordPress Publishing Workflow

```
1. User completes Review (Publication) stage
   ↓
2. User navigates to WordPress Publishing view
   ↓
3. System displays:
   - Connection status (test credentials)
   - Blog preview
   - Category/tag selectors (hybrid dropdown)
   - Featured image selector
   - Publish date input
   ↓
4. User clicks "Publish to WordPress"
   ↓
5. System:
   - Converts blog.full_draft YAML to HTML
   - Uploads selected images to WordPress Media Library
   - Replaces <!-- IMAGE:asset-id --> with <img> tags
   - Resolves categories/tags (create if needed)
   - Creates WordPress post as draft/scheduled
   - Updates project status to "published"
   - Saves WordPress post ID and URL to database
   ↓
6. Success notification with link to WordPress post
```

### Image Selection and Placeholder Workflow

```
1. User in Assets stage
   ↓
2. System displays Unsplash search (query = primary_keyword)
   ↓
3. User browses image grid
   ↓
4. User clicks images to select (featured + content images)
   ↓
5. System saves selections to assets table with project_id
   ↓
6. User navigates to Production stage
   ↓
7. User manually inserts <!-- IMAGE:asset-1 --> in blog draft
   ↓
8. On WordPress publish:
   - System uploads images to WordPress Media Library
   - Gets WordPress media IDs and URLs
   - Replaces <!-- IMAGE:asset-1 --> with <img src="wp-url">
   - Sets featured_media field
```

## Database Schema Updates

### Add AI Provider Config

```prisma
model AIProviderConfig {
  id           String   @id @default(cuid())
  provider     String   // openai, anthropic, local
  api_key      String   // Encrypted
  is_active    Boolean  @default(false)
  config_json  String?  @db.Text // Additional settings
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt
}
```

### Update WordPress Config for Encryption

```prisma
model WordPressConfig {
  id         String   @id @default(cuid())
  site_url   String
  username   String
  password   String   // Encrypted with crypto
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
}
```

### Update Assets Table

```prisma
model Asset {
  id              String   @id @default(cuid())
  project_id      String
  asset_type      String   // featured_image, content_image
  source          String   // unsplash
  source_url      String   // Unsplash download URL
  unsplash_id     String?
  alt_text        String?
  wordpress_id    Int?
  wordpress_url   String?
  created_at      DateTime @default(now())

  project         Project  @relation(fields: [project_id], references: [id], onDelete: Cascade)

  @@index([project_id])
}
```

## UI Components

### AI Generation Button

```typescript
// components/ai/GenerateButton.tsx
export default function GenerateButton({
  agentType,
  input,
  onGenerated,
}: {
  agentType: "discovery" | "production" | "review";
  input: any;
  onGenerated: (output: any) => void;
}) {
  // Check AI_ENABLED flag
  // Show loading state during generation
  // Handle errors with toast notifications
}
```

### WordPress Connection Panel

```typescript
// components/wordpress/ConnectionPanel.tsx
export default function ConnectionPanel() {
  // Display connection status
  // Test connection button
  // Configure credentials form
}
```

### WordPress Publishing Form

```typescript
// components/wordpress/PublishingForm.tsx
export default function PublishingForm({ projectId }: { projectId: string }) {
  // Blog preview
  // Category/tag hybrid selectors
  // Featured image selector
  // Publish date picker
  // Publish button
}
```

### Unsplash Image Grid

```typescript
// components/assets/UnsplashGrid.tsx
export default function UnsplashGrid({
  keyword,
  onSelect,
}: {
  keyword: string;
  onSelect: (image: UnsplashImage) => void;
}) {
  // Search input
  // Image grid with thumbnails
  // Selection checkmarks
  // Download attribution
}
```

### Image Placeholder Editor

```typescript
// components/assets/PlaceholderEditor.tsx
export default function PlaceholderEditor({
  content,
  assets,
  onChange,
}: {
  content: string;
  assets: Asset[];
  onChange: (content: string) => void;
}) {
  // Rich text editor or textarea
  // Insert placeholder button dropdown
  // Preview selected images
}
```

## Implementation Tasks

1. **Build AI Provider Abstraction**
   - Create provider interface
   - Implement OpenAI provider
   - Implement Anthropic provider
   - Add database config storage with encryption
   - Create API endpoints for AI generation

2. **Implement WordPress Integration**
   - Create WordPress client class
   - Add connection test functionality
   - Build draft creation with HTML conversion
   - Implement category/tag hybrid resolver
   - Add media upload functionality
   - Build publishing form UI

3. **Integrate Unsplash API**
   - Create Unsplash client
   - Build image search endpoint
   - Create image grid component
   - Implement asset selection and storage
   - Add placeholder editor

4. **Build Publishing Workflow**
   - Create WordPress publishing page
   - Implement image upload to WordPress
   - Build placeholder replacement logic
   - Add scheduled publishing support
   - Create success/error handling

5. **Add Encryption Utilities**
   - Implement crypto functions for API keys
   - Add encryption for WordPress passwords
   - Create secure config storage

6. **Test Integration**
   - Test AI generation with schemas
   - Verify WordPress connection and publishing
   - Test image upload and replacement
   - Validate category/tag creation

## Success Criteria

- ✅ AI provider abstraction working with OpenAI and Anthropic
- ✅ AI generation validates against Zod schemas
- ✅ Manual mode fallback functional when AI disabled
- ✅ WordPress connection test successful
- ✅ Blog drafts created in WordPress with correct meta fields
- ✅ Categories and tags resolved (existing + new creation)
- ✅ Featured image uploaded to WordPress
- ✅ Image placeholders replaced with WordPress URLs
- ✅ Unsplash search and selection working
- ✅ Assets stored in database and linked to projects
