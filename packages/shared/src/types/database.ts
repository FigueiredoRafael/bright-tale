export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_prompts: {
        Row: {
          created_at: string
          id: string
          input_schema: string | null
          instructions: string
          name: string
          output_schema: string | null
          slug: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_schema?: string | null
          instructions: string
          name: string
          output_schema?: string | null
          slug: string
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          input_schema?: string | null
          instructions?: string
          name?: string
          output_schema?: string | null
          slug?: string
          stage?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_provider_configs: {
        Row: {
          api_key: string
          config_json: string | null
          created_at: string
          id: string
          is_active: boolean
          provider: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          api_key: string
          config_json?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          provider: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          api_key?: string
          config_json?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          alt_text: string | null
          asset_type: string
          content_id: string | null
          content_type: string | null
          created_at: string
          id: string
          local_path: string | null
          project_id: string | null
          prompt: string | null
          role: string | null
          source: string
          source_url: string | null
          updated_at: string
          user_id: string | null
          wordpress_id: number | null
          wordpress_url: string | null
        }
        Insert: {
          alt_text?: string | null
          asset_type: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          local_path?: string | null
          project_id?: string | null
          prompt?: string | null
          role?: string | null
          source: string
          source_url?: string | null
          updated_at?: string
          user_id?: string | null
          wordpress_id?: number | null
          wordpress_url?: string | null
        }
        Update: {
          alt_text?: string | null
          asset_type?: string
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          local_path?: string | null
          project_id?: string | null
          prompt?: string | null
          role?: string | null
          source?: string
          source_url?: string | null
          updated_at?: string
          user_id?: string | null
          wordpress_id?: number | null
          wordpress_url?: string | null
        }
        Relationships: []
      }
      blog_drafts: {
        Row: {
          affiliate_copy: string | null
          affiliate_link: string | null
          affiliate_placement: string | null
          affiliate_rationale: string | null
          created_at: string
          full_draft: string
          id: string
          idea_id: string | null
          internal_links_json: string | null
          meta_description: string
          outline_json: string | null
          primary_keyword: string | null
          project_id: string | null
          published_at: string | null
          secondary_keywords: string[]
          slug: string
          status: string
          title: string
          updated_at: string
          user_id: string | null
          word_count: number
          wordpress_post_id: number | null
          wordpress_url: string | null
        }
        Insert: {
          affiliate_copy?: string | null
          affiliate_link?: string | null
          affiliate_placement?: string | null
          affiliate_rationale?: string | null
          created_at?: string
          full_draft: string
          id?: string
          idea_id?: string | null
          internal_links_json?: string | null
          meta_description: string
          outline_json?: string | null
          primary_keyword?: string | null
          project_id?: string | null
          published_at?: string | null
          secondary_keywords?: string[]
          slug: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
          word_count?: number
          wordpress_post_id?: number | null
          wordpress_url?: string | null
        }
        Update: {
          affiliate_copy?: string | null
          affiliate_link?: string | null
          affiliate_placement?: string | null
          affiliate_rationale?: string | null
          created_at?: string
          full_draft?: string
          id?: string
          idea_id?: string | null
          internal_links_json?: string | null
          meta_description?: string
          outline_json?: string | null
          primary_keyword?: string | null
          project_id?: string | null
          published_at?: string | null
          secondary_keywords?: string[]
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          word_count?: number
          wordpress_post_id?: number | null
          wordpress_url?: string | null
        }
        Relationships: []
      }
      canonical_core: {
        Row: {
          affiliate_moment_json: string | null
          argument_chain_json: string
          created_at: string
          cta_comment_prompt: string | null
          cta_subscribe: string | null
          emotional_arc_json: string
          id: string
          idea_id: string
          key_quotes_json: string | null
          key_stats_json: string
          project_id: string | null
          thesis: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          affiliate_moment_json?: string | null
          argument_chain_json: string
          created_at?: string
          cta_comment_prompt?: string | null
          cta_subscribe?: string | null
          emotional_arc_json: string
          id?: string
          idea_id: string
          key_quotes_json?: string | null
          key_stats_json: string
          project_id?: string | null
          thesis: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          affiliate_moment_json?: string | null
          argument_chain_json?: string
          created_at?: string
          cta_comment_prompt?: string | null
          cta_subscribe?: string | null
          emotional_arc_json?: string
          id?: string
          idea_id?: string
          key_quotes_json?: string | null
          key_stats_json?: string
          project_id?: string | null
          thesis?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      idea_archives: {
        Row: {
          core_tension: string
          created_at: string
          discovery_data: string
          id: string
          idea_id: string
          is_public: boolean
          markdown_content: string | null
          source_project_id: string | null
          source_type: string
          tags: string[]
          target_audience: string
          title: string
          updated_at: string
          usage_count: number
          user_id: string | null
          verdict: string
        }
        Insert: {
          core_tension: string
          created_at?: string
          discovery_data: string
          id?: string
          idea_id: string
          is_public?: boolean
          markdown_content?: string | null
          source_project_id?: string | null
          source_type?: string
          tags?: string[]
          target_audience: string
          title: string
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          verdict: string
        }
        Update: {
          core_tension?: string
          created_at?: string
          discovery_data?: string
          id?: string
          idea_id?: string
          is_public?: boolean
          markdown_content?: string | null
          source_project_id?: string | null
          source_type?: string
          tags?: string[]
          target_audience?: string
          title?: string
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          verdict?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          consumed: boolean
          created_at: string
          expires_at: string | null
          id: string
          purpose: string | null
          request_hash: string | null
          response: Json | null
          token: string
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          purpose?: string | null
          request_hash?: string | null
          response?: Json | null
          token: string
        }
        Update: {
          consumed?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          purpose?: string | null
          request_hash?: string | null
          response?: Json | null
          token?: string
        }
        Relationships: []
      }
      image_generator_configs: {
        Row: {
          api_key: string
          config_json: string | null
          created_at: string
          id: string
          is_active: boolean
          model: string
          provider: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          api_key: string
          config_json?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          model: string
          provider: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          api_key?: string
          config_json?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string
          provider?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      podcast_drafts: {
        Row: {
          created_at: string
          duration_estimate: string | null
          episode_description: string
          episode_title: string
          guest_questions: string[]
          id: string
          idea_id: string | null
          intro_hook: string
          outro: string
          personal_angle: string
          project_id: string | null
          status: string
          talking_points_json: string
          updated_at: string
          user_id: string | null
          word_count: number
        }
        Insert: {
          created_at?: string
          duration_estimate?: string | null
          episode_description: string
          episode_title: string
          guest_questions?: string[]
          id?: string
          idea_id?: string | null
          intro_hook: string
          outro: string
          personal_angle: string
          project_id?: string | null
          status?: string
          talking_points_json: string
          updated_at?: string
          user_id?: string | null
          word_count?: number
        }
        Update: {
          created_at?: string
          duration_estimate?: string | null
          episode_description?: string
          episode_title?: string
          guest_questions?: string[]
          id?: string
          idea_id?: string | null
          intro_hook?: string
          outro?: string
          personal_angle?: string
          project_id?: string | null
          status?: string
          talking_points_json?: string
          updated_at?: string
          user_id?: string | null
          word_count?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          auto_advance: boolean
          completed_stages: string[]
          created_at: string
          current_stage: string
          id: string
          research_id: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
          video_style_config: string | null
          winner: boolean
        }
        Insert: {
          auto_advance?: boolean
          completed_stages?: string[]
          created_at?: string
          current_stage: string
          id?: string
          research_id?: string | null
          status: string
          title: string
          updated_at?: string
          user_id?: string | null
          video_style_config?: string | null
          winner?: boolean
        }
        Update: {
          auto_advance?: boolean
          completed_stages?: string[]
          created_at?: string
          current_stage?: string
          id?: string
          research_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          video_style_config?: string | null
          winner?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "projects_research_id_fkey"
            columns: ["research_id"]
            isOneToOne: false
            referencedRelation: "research_archives"
            referencedColumns: ["id"]
          },
        ]
      }
      research_archives: {
        Row: {
          created_at: string
          id: string
          projects_count: number
          research_content: string
          theme: string
          title: string
          updated_at: string
          user_id: string | null
          winners_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          projects_count?: number
          research_content: string
          theme: string
          title: string
          updated_at?: string
          user_id?: string | null
          winners_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          projects_count?: number
          research_content?: string
          theme?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          winners_count?: number
        }
        Relationships: []
      }
      research_sources: {
        Row: {
          author: string | null
          created_at: string
          date: string | null
          id: string
          research_id: string
          title: string
          url: string
        }
        Insert: {
          author?: string | null
          created_at?: string
          date?: string | null
          id?: string
          research_id: string
          title: string
          url: string
        }
        Update: {
          author?: string | null
          created_at?: string
          date?: string | null
          id?: string
          research_id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_sources_research_id_fkey"
            columns: ["research_id"]
            isOneToOne: false
            referencedRelation: "research_archives"
            referencedColumns: ["id"]
          },
        ]
      }
      revisions: {
        Row: {
          change_notes: string | null
          created_at: string
          created_by: string | null
          id: string
          stage_id: string
          version: number
          yaml_artifact: string
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          stage_id: string
          version: number
          yaml_artifact: string
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          stage_id?: string
          version?: number
          yaml_artifact?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisions_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      shorts_drafts: {
        Row: {
          created_at: string
          id: string
          idea_id: string | null
          project_id: string | null
          short_count: number
          shorts_json: string
          status: string
          total_duration: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          idea_id?: string | null
          project_id?: string | null
          short_count?: number
          shorts_json: string
          status?: string
          total_duration?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          idea_id?: string | null
          project_id?: string | null
          short_count?: number
          shorts_json?: string
          status?: string
          total_duration?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      stages: {
        Row: {
          created_at: string
          id: string
          project_id: string
          stage_type: string
          version: number
          yaml_artifact: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          stage_type: string
          version?: number
          yaml_artifact: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          stage_type?: string
          version?: number
          yaml_artifact?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          config_json: string
          created_at: string
          id: string
          name: string
          parent_template_id: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          config_json: string
          created_at?: string
          id?: string
          name: string
          parent_template_id?: string | null
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          config_json?: string
          created_at?: string
          id?: string
          name?: string
          parent_template_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          id: string
          first_name: string | null
          last_name: string | null
          avatar_url: string | null
          email: string
          is_premium: boolean
          premium_plan: string | null
          premium_started_at: string | null
          premium_expires_at: string | null
          is_active: boolean
          onboarding_completed: boolean
          onboarding_step: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          email?: string
          is_premium?: boolean
          premium_plan?: string | null
          premium_started_at?: string | null
          premium_expires_at?: string | null
          is_active?: boolean
          onboarding_completed?: boolean
          onboarding_step?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          first_name?: string | null
          last_name?: string | null
          avatar_url?: string | null
          email?: string
          is_premium?: boolean
          premium_plan?: string | null
          premium_started_at?: string | null
          premium_expires_at?: string | null
          is_active?: boolean
          onboarding_completed?: boolean
          onboarding_step?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_references: {
        Row: { id: string; channel_id: string; org_id: string; url: string; platform: string; name: string | null; external_id: string | null; subscribers: number | null; monthly_views: number | null; video_count: number | null; patterns_json: Record<string, unknown> | null; analyzed_at: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; channel_id: string; org_id: string; url: string; platform?: string; name?: string | null; external_id?: string | null; subscribers?: number | null; monthly_views?: number | null; video_count?: number | null; patterns_json?: Record<string, unknown> | null; analyzed_at?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; channel_id?: string; org_id?: string; url?: string; platform?: string; name?: string | null; external_id?: string | null; subscribers?: number | null; monthly_views?: number | null; video_count?: number | null; patterns_json?: Record<string, unknown> | null; analyzed_at?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      reference_content: {
        Row: { id: string; reference_id: string; external_id: string; title: string; url: string | null; published_at: string | null; view_count: number | null; like_count: number | null; comment_count: number | null; duration_seconds: number | null; engagement_rate: number | null; description: string | null; tags: string[] | null; transcript: string | null; created_at: string }
        Insert: { id?: string; reference_id: string; external_id: string; title: string; url?: string | null; published_at?: string | null; view_count?: number | null; like_count?: number | null; comment_count?: number | null; duration_seconds?: number | null; engagement_rate?: number | null; description?: string | null; tags?: string[] | null; transcript?: string | null; created_at?: string }
        Update: { id?: string; reference_id?: string; external_id?: string; title?: string; url?: string | null; published_at?: string | null; view_count?: number | null; like_count?: number | null; comment_count?: number | null; duration_seconds?: number | null; engagement_rate?: number | null; description?: string | null; tags?: string[] | null; transcript?: string | null; created_at?: string }
        Relationships: []
      }
      youtube_niche_analyses: {
        Row: { id: string; channel_id: string | null; org_id: string; user_id: string; niche: string; market: string; language: string; reference_channels_json: Json | null; top_videos_json: Json | null; opportunities_json: Json | null; saturated_topics_json: Json | null; optimal_duration: string | null; optimal_posting_schedule: string | null; analyzed_at: string; expires_at: string; created_at: string }
        Insert: { id?: string; channel_id?: string | null; org_id: string; user_id: string; niche: string; market: string; language: string; reference_channels_json?: Record<string, unknown> | null; top_videos_json?: Record<string, unknown> | null; opportunities_json?: Record<string, unknown> | null; saturated_topics_json?: Record<string, unknown> | null; optimal_duration?: string | null; optimal_posting_schedule?: string | null; analyzed_at?: string; expires_at?: string; created_at?: string }
        Update: { id?: string; channel_id?: string | null; org_id?: string; user_id?: string; niche?: string; market?: string; language?: string; reference_channels_json?: Record<string, unknown> | null; top_videos_json?: Record<string, unknown> | null; opportunities_json?: Record<string, unknown> | null; saturated_topics_json?: Record<string, unknown> | null; optimal_duration?: string | null; optimal_posting_schedule?: string | null; analyzed_at?: string; expires_at?: string; created_at?: string }
        Relationships: []
      }
      channels: {
        Row: {
          id: string
          org_id: string
          user_id: string
          name: string
          niche: string | null
          niche_tags: string[] | null
          market: string
          language: string
          channel_type: string
          media_types: string[]
          video_style: string | null
          logo_url: string | null
          is_evergreen: boolean
          youtube_url: string | null
          youtube_channel_id: string | null
          blog_url: string | null
          wordpress_config_id: string | null
          voice_provider: string | null
          voice_id: string | null
          voice_speed: number
          voice_style: string | null
          model_tier: string
          custom_model_config_json: Record<string, unknown> | null
          tone: string | null
          template_id: string | null  // text FK, not uuid
          youtube_subs: number | null
          youtube_monthly_views: number | null
          estimated_revenue_brl: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          name: string
          niche?: string | null
          niche_tags?: string[] | null
          market?: string
          language?: string
          channel_type?: string
          media_types?: string[]
          video_style?: string | null
          logo_url?: string | null
          is_evergreen?: boolean
          youtube_url?: string | null
          youtube_channel_id?: string | null
          blog_url?: string | null
          wordpress_config_id?: string | null
          voice_provider?: string | null
          voice_id?: string | null
          voice_speed?: number
          voice_style?: string | null
          model_tier?: string
          custom_model_config_json?: Record<string, unknown> | null
          tone?: string | null
          template_id?: string | null
          youtube_subs?: number | null
          youtube_monthly_views?: number | null
          estimated_revenue_brl?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          name?: string
          niche?: string | null
          niche_tags?: string[] | null
          market?: string
          language?: string
          channel_type?: string
          media_types?: string[]
          video_style?: string | null
          logo_url?: string | null
          is_evergreen?: boolean
          youtube_url?: string | null
          youtube_channel_id?: string | null
          blog_url?: string | null
          wordpress_config_id?: string | null
          voice_provider?: string | null
          voice_id?: string | null
          voice_speed?: number
          voice_style?: string | null
          model_tier?: string
          custom_model_config_json?: Record<string, unknown> | null
          tone?: string | null
          template_id?: string | null
          youtube_subs?: number | null
          youtube_monthly_views?: number | null
          estimated_revenue_brl?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_usage: {
        Row: {
          id: string
          org_id: string
          user_id: string
          action: string
          category: string
          cost: number
          source: string
          metadata_json: Record<string, unknown> | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          action: string
          category: string
          cost: number
          source?: string
          metadata_json?: Record<string, unknown> | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          action?: string
          category?: string
          cost?: number
          source?: string
          metadata_json?: Record<string, unknown> | null
          created_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: string
          billing_cycle: string | null
          plan_started_at: string | null
          plan_expires_at: string | null
          credits_total: number
          credits_used: number
          credits_reset_at: string | null
          credits_addon: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          logo_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: string
          billing_cycle?: string | null
          plan_started_at?: string | null
          plan_expires_at?: string | null
          credits_total?: number
          credits_used?: number
          credits_reset_at?: string | null
          credits_addon?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          logo_url?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: string
          billing_cycle?: string | null
          plan_started_at?: string | null
          plan_expires_at?: string | null
          credits_total?: number
          credits_used?: number
          credits_reset_at?: string | null
          credits_addon?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_memberships: {
        Row: {
          id: string
          org_id: string
          user_id: string
          role: string
          credit_limit: number | null
          credits_used_cycle: number
          invited_by: string | null
          invited_at: string | null
          accepted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          user_id: string
          role?: string
          credit_limit?: number | null
          credits_used_cycle?: number
          invited_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          user_id?: string
          role?: string
          credit_limit?: number | null
          credits_used_cycle?: number
          invited_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_invites: {
        Row: {
          id: string
          org_id: string
          email: string
          role: string
          invited_by: string
          token: string
          status: string
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          email: string
          role?: string
          invited_by: string
          token: string
          status?: string
          expires_at: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          email?: string
          role?: string
          invited_by?: string
          token?: string
          status?: string
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: number
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          role: string
          created_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      video_drafts: {
        Row: {
          created_at: string
          id: string
          idea_id: string | null
          project_id: string | null
          script_json: string | null
          status: string
          thumbnail_json: string | null
          title: string
          title_options: string[]
          total_duration_estimate: string | null
          updated_at: string
          user_id: string | null
          word_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          idea_id?: string | null
          project_id?: string | null
          script_json?: string | null
          status?: string
          thumbnail_json?: string | null
          title: string
          title_options?: string[]
          total_duration_estimate?: string | null
          updated_at?: string
          user_id?: string | null
          word_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          idea_id?: string | null
          project_id?: string | null
          script_json?: string | null
          status?: string
          thumbnail_json?: string | null
          title?: string
          title_options?: string[]
          total_duration_estimate?: string | null
          updated_at?: string
          user_id?: string | null
          word_count?: number
        }
        Relationships: []
      }
      wordpress_configs: {
        Row: {
          created_at: string
          id: string
          password: string
          site_url: string
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          password: string
          site_url: string
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          password?: string
          site_url?: string
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      users_page_kpis: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      users_page_sparklines: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      users_page_growth: {
        Args: {
          p_from: string
          p_to: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

