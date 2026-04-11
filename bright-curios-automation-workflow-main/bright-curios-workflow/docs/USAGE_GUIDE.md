# Usage Guide: Operating the Workflow

The BrightCurios Workflow Platform is designed for high-quality, AI-assisted content production. This guide explains how to use the "Human-in-the-loop" system to create content across 5 distinct stages.

## Core Concepts

- **Agents**: Specialized AI personas (Brainstorm, Research, Production, Review) with specific instructions.
- **Contracts**: Structured YAML data (Input/Output) that ensures consistency between the platform and the AI.
- **Projects**: The container for a single content piece's journey through the stages.

---

## 1. Research (The Foundation)

Before starting a workflow, you often need a foundation of research.

1.  Navigate to the **Research** tab.
2.  Click **Create Research**.
3.  Enter a theme and description.
4.  Add **Sources** (URLs, titles, key insights) as you find them.
5.  This research can be linked to multiple projects later.

---

## 2. Starting a New Project

1.  On the **Dashboard**, click the **Start Workflow** button.
2.  Enter a title for your project.
3.  (Optional) Link an existing **Research** entry.
4.  The project will open in the **Focused View**, starting at the **Brainstorm** stage.

---

## 3. The 4-Agent Workflow

Each stage follows a similar "Human-in-the-loop" pattern.

### Stage 1: Brainstorming
*Goal: Generate 5 ideas based on a theme and select the best one.*

1.  **Fill the Form**: Enter your primary theme, goal, and constraints.
2.  **Generate Prompt**: Click "Generate AI Prompt". The platform creates a `BC_BRAINSTORM_INPUT` YAML.
3.  **Copy to AI**: Copy the generated YAML. Open your **Brainstorm Agent** (ChatGPT Custom GPT) and paste the YAML.
4.  **Parse Response**: Copy the AI's YAML response (`BC_BRAINSTORM_OUTPUT`) and paste it back into the platform.
5.  **Select Idea**: Review the 5 generated ideas and the Agent's recommendation. Select one to proceed.
6.  **Complete**: Click "Complete & Continue to Research".

### Stage 2: Research
*Goal: Validate the selected idea and gather supporting evidence.*

1.  The platform automatically maps your selected idea to the Research input.
2.  Follow the same **Generate → Copy → AI → Paste** cycle with the **Research Agent**.
3.  Review the sources, statistics, and expert quotes gathered by the AI.
4.  Click "Complete & Continue to Production".

### Stage 3: Production
*Goal: Generate the full blog post, scripts, and social assets.*

1.  Generate the `BC_PRODUCTION_INPUT` YAML.
2.  Pass it to the **Production Agent**.
3.  Paste the AI's response back. You will see tabs for:
    - **Blog**: Full draft.
    - **Video**: Script with timestamps.
    - **Shorts**: Multiple short-form scripts.
    - **Podcast**: Talking points.
4.  Click "Complete & Continue to Review".

### Stage 4: Review
*Goal: Quality check the content and create a publication plan.*

1.  Generate the `BC_REVIEW_INPUT` YAML.
2.  Pass it to the **Review Agent**.
3.  Review the AI's score, identified issues, and the **Publication Plan**.
4.  If the verdict is "Approved," click "Complete & Continue to Publish".

---

## 4. Features & Productivity Tips

### Autosave & Revisions
- The platform **autosaves** your work every 30 seconds while you are editing a stage.
- Every save creates a new **Revision**. You can view previous versions of any stage (Step 6 feature, currently via API/DB).

### Idea Library
- You can save all brainstormed ideas to your **Library** for future use.
- When starting a new project, you can "Select from Library" to skip the brainstorming stage entirely.

### Multi-Project Dashboard
- Use the **Dashboard** to track the status of all active projects.
- **Filters**: Quickly find projects by stage or status.
- **Bulk Operations**: Select multiple projects to Archive, Delete, or Export their data as JSON.

### Template Management
- Create **Templates** for common configurations (e.g., "Tech Blog Template").
- Templates support **Inheritance**, so a "JavaScript" template can inherit from a "Tech Blog" template.

---

## 5. Publishing to WordPress

Once a project reaches the **Publish** stage:

1.  Go to the **WordPress** tab in the project view.
2.  (First time) Configure your WordPress site URL, username, and Application Password in **Settings**.
3.  Review the blog content and metadata.
4.  Click **Publish to WordPress** to create a draft or live post directly on your site.

---

## Troubleshooting YAML Errors

If the platform fails to parse an AI response:
- Ensure the AI included the proper wrapper (e.g., `BC_BRAINSTORM_OUTPUT:`).
- Check for common YAML syntax errors (curly quotes vs. straight quotes, incorrect indentation).
- Use the **YAML** tab in the stage view to manually fix minor issues before saving.
