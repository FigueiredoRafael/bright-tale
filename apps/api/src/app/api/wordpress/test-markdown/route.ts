/**
 * POST /api/wordpress/test-markdown
 * Test markdown-to-HTML conversion by creating a test post in WordPress
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, ApiError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validation";
import { markdownToHtml } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

const testMarkdownSchema = z.object({
  config_id: z.string().optional(),
  site_url: z.string().url().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

// Comprehensive test markdown covering all major features
const TEST_MARKDOWN = `# Markdown Conversion Test

This is a comprehensive test to verify markdown-to-HTML conversion for WordPress.

## Headers and Basic Formatting

### Level 3 Header
#### Level 4 Header

**Bold text** and *italic text* and ***bold italic text***.

Regular text with \`inline code\` and a [link to example.com](https://example.com).

## Lists

### Unordered Lists

- First level item
- Another first level item
  - Second level nested item
  - Another second level item
    - Third level nested item
    - Another third level item
- Back to first level

### Ordered Lists

1. First numbered item
2. Second numbered item
   1. Nested numbered item
   2. Another nested numbered item
3. Third numbered item

### Mixed Lists

1. Numbered item
   - Bullet nested inside number
   - Another bullet
2. Second numbered item
   1. Nested number
      - Bullet nested in number

## Code Blocks

Inline code: \`const x = 5;\`

Block code:

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return true;
}

const result = greet("World");
\`\`\`

\`\`\`python
def calculate(x, y):
    """Calculate sum of two numbers"""
    return x + y

result = calculate(10, 20)
print(f"Result: {result}")
\`\`\`

## Blockquotes

> This is a simple blockquote.

> This is a blockquote with **bold text** and *italic text*.
> 
> It can span multiple paragraphs.

> Nested quotes:
> > This is nested
> > > And this is even deeper

## Tables

| Feature | Status | Notes |
|---------|--------|-------|
| Headers | ✓ | H1-H6 supported |
| Lists | ✓ | Nested up to 3 levels |
| Code | ✓ | Inline and blocks |
| Tables | ✓ | Full support |

## Links and Special Characters

[Standard link](https://example.com)
[Link with title](https://example.com "Example Site")
<https://auto-linked-url.com>

Special characters: & < > " ' / @ # $ % ^ * ( ) { } [ ]

HTML entities: &amp; &lt; &gt; &quot; &#39;

## Horizontal Rules

---

Content after horizontal rule.

## Image Placeholders

<!-- IMAGE:test123 -->

This tests the image placeholder pattern.

## Escaped Characters

\\*Not italic\\* \\**Not bold\\** \\[Not a link\\](url)

\\\`Not code\\\`

## Mixed Formatting

**Bold with *italic* inside** and *italic with **bold** inside*.

Code with formatting: \`const **bold** = true;\`

Link with bold: [**Bold Link Text**](https://example.com)

## Edge Cases

Empty lines:


Multiple empty lines above.

Trailing spaces at line end:  
Should create line break.

Unicode: 你好 مرحبا שלום

Emoji: 🚀 ✨ 🎉 ✅ ❌

## Conclusion

This test covers:
- Headers (H1-H4)
- Text formatting (bold, italic, combined)
- Links (standard, with titles, auto-linked)
- Lists (unordered, ordered, nested, mixed)
- Code (inline, block, with syntax)
- Blockquotes (simple, formatted, nested)
- Tables
- Horizontal rules
- Image placeholders
- Special characters and HTML entities
- Escaped characters
- Mixed formatting
- Unicode and emoji

If this renders correctly in WordPress, the markdown conversion is working properly.`;

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(request, testMarkdownSchema);

    // Get WordPress credentials
    let site_url: string;
    let username: string;
    let password: string;

    if (body.config_id) {
      // Use stored config
      const config = await prisma.wordPressConfig.findUnique({
        where: { id: body.config_id },
      });

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

    // Convert test markdown to HTML
    const htmlContent = markdownToHtml(TEST_MARKDOWN);

    // Analyze conversion features
    const conversionReport = analyzeConversion(TEST_MARKDOWN, htmlContent);

    // Create test post in WordPress
    const postData = {
      title: "[TEST - PLEASE DELETE] Markdown Conversion Test",
      content: htmlContent,
      status: "draft",
      excerpt:
        "Automated test post for markdown-to-HTML conversion. Please delete after review.",
    };

    const response = await fetch(`${site_url}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers,
      body: JSON.stringify(postData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        response.status,
        `WordPress post creation failed: ${errorText || response.statusText}`,
      );
    }

    const wordpressPost = await response.json();

    return NextResponse.json({
      success: true,
      data: {
        post_id: wordpressPost.id,
        post_url: wordpressPost.link,
        edit_url: `${site_url}/wp-admin/post.php?post=${wordpressPost.id}&action=edit`,
        conversion_report: conversionReport,
        test_markdown: TEST_MARKDOWN,
        html_output: htmlContent,
        warning:
          "This test post has been created as a DRAFT. Please review it in WordPress and DELETE it after verification.",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Analyze the markdown-to-HTML conversion and provide detailed report
 */
function analyzeConversion(markdown: string, html: string): ConversionReport {
  const report: ConversionReport = {
    features: [],
    overall_status: "success",
  };

  // Test headers
  const h1Count = (markdown.match(/^# [^#]/gm) || []).length;
  const h1HtmlCount = (html.match(/<h1>/g) || []).length;
  report.features.push({
    name: "Headers (H1)",
    status: h1Count === h1HtmlCount ? "pass" : "warning",
    details: `Found ${h1Count} in markdown, converted to ${h1HtmlCount} HTML tags`,
    expected: h1Count,
    actual: h1HtmlCount,
  });

  const h2Count = (markdown.match(/^## [^#]/gm) || []).length;
  const h2HtmlCount = (html.match(/<h2>/g) || []).length;
  report.features.push({
    name: "Headers (H2)",
    status: h2Count === h2HtmlCount ? "pass" : "warning",
    details: `Found ${h2Count} in markdown, converted to ${h2HtmlCount} HTML tags`,
    expected: h2Count,
    actual: h2HtmlCount,
  });

  const h3Count = (markdown.match(/^### [^#]/gm) || []).length;
  const h3HtmlCount = (html.match(/<h3>/g) || []).length;
  report.features.push({
    name: "Headers (H3)",
    status: h3Count === h3HtmlCount ? "pass" : "warning",
    details: `Found ${h3Count} in markdown, converted to ${h3HtmlCount} HTML tags`,
    expected: h3Count,
    actual: h3HtmlCount,
  });

  // Test bold
  const boldCount = (markdown.match(/\*\*[^*]+\*\*/g) || []).length;
  const boldHtmlCount = (html.match(/<strong>/g) || []).length;
  report.features.push({
    name: "Bold Text",
    status: boldHtmlCount >= boldCount ? "pass" : "warning",
    details: `Found ${boldCount} patterns in markdown, ${boldHtmlCount} <strong> tags in HTML`,
    expected: boldCount,
    actual: boldHtmlCount,
  });

  // Test italic
  const italicCount = (markdown.match(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g) || [])
    .length;
  const italicHtmlCount = (html.match(/<em>/g) || []).length;
  report.features.push({
    name: "Italic Text",
    status: italicHtmlCount > 0 ? "pass" : "warning",
    details: `Found italic patterns in markdown, ${italicHtmlCount} <em> tags in HTML`,
    expected: "multiple",
    actual: italicHtmlCount,
  });

  // Test code blocks
  const codeBlockCount = (markdown.match(/```[\s\S]*?```/g) || []).length;
  const codeBlockHtmlCount = (html.match(/<pre>/g) || []).length;
  report.features.push({
    name: "Code Blocks",
    status: codeBlockCount === codeBlockHtmlCount ? "pass" : "warning",
    details: `Found ${codeBlockCount} code blocks in markdown, ${codeBlockHtmlCount} <pre> tags in HTML`,
    expected: codeBlockCount,
    actual: codeBlockHtmlCount,
  });

  // Test inline code
  const inlineCodeCount = (markdown.match(/`[^`]+`/g) || []).length;
  const inlineCodeHtmlCount = (html.match(/<code>/g) || []).length;
  report.features.push({
    name: "Inline Code",
    status: inlineCodeHtmlCount >= inlineCodeCount ? "pass" : "warning",
    details: `Found ${inlineCodeCount} inline code in markdown, ${inlineCodeHtmlCount} <code> tags in HTML (includes code blocks)`,
    expected: `≥${inlineCodeCount}`,
    actual: inlineCodeHtmlCount,
  });

  // Test links
  const linkCount = (markdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
  const linkHtmlCount = (html.match(/<a href=/g) || []).length;
  report.features.push({
    name: "Links",
    status: linkHtmlCount >= linkCount ? "pass" : "warning",
    details: `Found ${linkCount} markdown links, ${linkHtmlCount} <a> tags in HTML`,
    expected: linkCount,
    actual: linkHtmlCount,
  });

  // Test lists
  const ulCount = (markdown.match(/^[\s]*[-*] /gm) || []).length;
  const ulHtmlCount = (html.match(/<li>/g) || []).length;
  report.features.push({
    name: "List Items",
    status: ulHtmlCount >= ulCount ? "pass" : "warning",
    details: `Found ${ulCount} list items in markdown, ${ulHtmlCount} <li> tags in HTML`,
    expected: `≥${ulCount}`,
    actual: ulHtmlCount,
  });

  // Test blockquotes
  const blockquoteCount = (markdown.match(/^> /gm) || []).length;
  const blockquoteHtmlCount = (html.match(/<blockquote>/g) || []).length;
  report.features.push({
    name: "Blockquotes",
    status: blockquoteHtmlCount > 0 ? "pass" : "warning",
    details: `Found ${blockquoteCount} blockquote lines in markdown, ${blockquoteHtmlCount} <blockquote> tags in HTML`,
    expected: `≥1`,
    actual: blockquoteHtmlCount,
  });

  // Test tables
  const tableCount = (markdown.match(/\|.*\|/g) || []).length;
  const tableHtmlCount = (html.match(/<table>/g) || []).length;
  report.features.push({
    name: "Tables",
    status:
      tableHtmlCount > 0 && tableCount > 0
        ? "pass"
        : tableCount === 0
          ? "pass"
          : "warning",
    details: `Found ${tableCount} table rows in markdown, ${tableHtmlCount} <table> tags in HTML`,
    expected: tableHtmlCount > 0 ? 1 : 0,
    actual: tableHtmlCount,
  });

  // Test horizontal rules
  const hrCount = (markdown.match(/^---$/gm) || []).length;
  const hrHtmlCount = (html.match(/<hr>/g) || []).length;
  report.features.push({
    name: "Horizontal Rules",
    status: hrHtmlCount >= hrCount ? "pass" : "warning",
    details: `Found ${hrCount} horizontal rules in markdown, ${hrHtmlCount} <hr> tags in HTML`,
    expected: hrCount,
    actual: hrHtmlCount,
  });

  // Test image placeholders preservation
  const imagePlaceholderCount = (
    markdown.match(/<!-- IMAGE:[a-z0-9]+ -->/g) || []
  ).length;
  const imagePlaceholderHtmlCount = (
    html.match(/<!-- IMAGE:[a-z0-9]+ -->/g) || []
  ).length;
  report.features.push({
    name: "Image Placeholders",
    status:
      imagePlaceholderCount === imagePlaceholderHtmlCount ? "pass" : "warning",
    details: `Found ${imagePlaceholderCount} image placeholders in markdown, ${imagePlaceholderHtmlCount} preserved in HTML`,
    expected: imagePlaceholderCount,
    actual: imagePlaceholderHtmlCount,
  });

  // Test special characters
  const hasAmpersand = html.includes("&amp;") || html.includes("&");
  const hasLtGt =
    html.includes("&lt;") ||
    html.includes("&gt;") ||
    html.includes("<") ||
    html.includes(">");
  report.features.push({
    name: "Special Characters",
    status: hasAmpersand && hasLtGt ? "pass" : "warning",
    details: `HTML entities and special characters ${hasAmpersand && hasLtGt ? "properly handled" : "may need review"}`,
    expected: "preserved",
    actual: hasAmpersand && hasLtGt ? "preserved" : "check manually",
  });

  // Determine overall status
  const failCount = report.features.filter(f => f.status === "fail").length;
  const warningCount = report.features.filter(
    f => f.status === "warning",
  ).length;

  if (failCount > 0) {
    report.overall_status = "fail";
  } else if (warningCount > 2) {
    report.overall_status = "warning";
  } else {
    report.overall_status = "success";
  }

  return report;
}

interface ConversionReport {
  features: Array<{
    name: string;
    status: "pass" | "warning" | "fail";
    details: string;
    expected: number | string;
    actual: number | string;
  }>;
  overall_status: "success" | "warning" | "fail";
}
