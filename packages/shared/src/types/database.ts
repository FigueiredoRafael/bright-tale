export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
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
          org_id: string | null
          output_schema: string | null
          recommended_model: string | null
          recommended_provider: string | null
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
          org_id?: string | null
          output_schema?: string | null
          recommended_model?: string | null
          recommended_provider?: string | null
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
          org_id?: string | null
          output_schema?: string | null
          recommended_model?: string | null
          recommended_provider?: string | null
          slug?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_configs: {
        Row: {
          api_key: string
          config_json: string | null
          created_at: string
          id: string
          is_active: boolean
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          provider?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "blog_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorm_drafts: {
        Row: {
          channel_id: string | null
          core_tension: string | null
          created_at: string
          discovery_data: string | null
          expires_at: string
          id: string
          org_id: string
          position: number
          session_id: string
          target_audience: string | null
          title: string
          user_id: string | null
          verdict: string | null
        }
        Insert: {
          channel_id?: string | null
          core_tension?: string | null
          created_at?: string
          discovery_data?: string | null
          expires_at?: string
          id?: string
          org_id: string
          position?: number
          session_id: string
          target_audience?: string | null
          title: string
          user_id?: string | null
          verdict?: string | null
        }
        Update: {
          channel_id?: string | null
          core_tension?: string | null
          created_at?: string
          discovery_data?: string | null
          expires_at?: string
          id?: string
          org_id?: string
          position?: number
          session_id?: string
          target_audience?: string | null
          title?: string
          user_id?: string | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_drafts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brainstorm_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brainstorm_drafts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorm_sessions: {
        Row: {
          channel_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input_json: Json
          input_mode: string
          model_tier: string
          org_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_json?: Json
          input_mode: string
          model_tier?: string
          org_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_json?: Json
          input_mode?: string
          model_tier?: string
          org_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brainstorm_sessions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brainstorm_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          project_id?: string | null
          thesis?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "canonical_core_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_references: {
        Row: {
          analyzed_at: string | null
          channel_id: string
          created_at: string
          external_id: string | null
          id: string
          monthly_views: number | null
          name: string | null
          org_id: string
          patterns_json: Json | null
          platform: string
          subscribers: number | null
          updated_at: string
          url: string
          video_count: number | null
        }
        Insert: {
          analyzed_at?: string | null
          channel_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          monthly_views?: number | null
          name?: string | null
          org_id: string
          patterns_json?: Json | null
          platform?: string
          subscribers?: number | null
          updated_at?: string
          url: string
          video_count?: number | null
        }
        Update: {
          analyzed_at?: string | null
          channel_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          monthly_views?: number | null
          name?: string | null
          org_id?: string
          patterns_json?: Json | null
          platform?: string
          subscribers?: number | null
          updated_at?: string
          url?: string
          video_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_references_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_references_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          blog_url: string | null
          channel_type: string
          created_at: string
          custom_model_config_json: Json | null
          estimated_revenue_brl: number | null
          id: string
          is_evergreen: boolean
          language: string
          logo_url: string | null
          market: string
          media_types: string[]
          model_tier: string
          name: string
          niche: string | null
          niche_tags: string[] | null
          org_id: string
          presentation_style: string
          template_id: string | null
          tone: string | null
          updated_at: string
          user_id: string
          video_style: string | null
          voice_id: string | null
          voice_provider: string | null
          voice_speed: number
          voice_style: string | null
          wordpress_config_id: string | null
          youtube_channel_id: string | null
          youtube_monthly_views: number | null
          youtube_subs: number | null
          youtube_url: string | null
        }
        Insert: {
          blog_url?: string | null
          channel_type?: string
          created_at?: string
          custom_model_config_json?: Json | null
          estimated_revenue_brl?: number | null
          id?: string
          is_evergreen?: boolean
          language?: string
          logo_url?: string | null
          market?: string
          media_types?: string[]
          model_tier?: string
          name: string
          niche?: string | null
          niche_tags?: string[] | null
          org_id: string
          presentation_style?: string
          template_id?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          video_style?: string | null
          voice_id?: string | null
          voice_provider?: string | null
          voice_speed?: number
          voice_style?: string | null
          wordpress_config_id?: string | null
          youtube_channel_id?: string | null
          youtube_monthly_views?: number | null
          youtube_subs?: number | null
          youtube_url?: string | null
        }
        Update: {
          blog_url?: string | null
          channel_type?: string
          created_at?: string
          custom_model_config_json?: Json | null
          estimated_revenue_brl?: number | null
          id?: string
          is_evergreen?: boolean
          language?: string
          logo_url?: string | null
          market?: string
          media_types?: string[]
          model_tier?: string
          name?: string
          niche?: string | null
          niche_tags?: string[] | null
          org_id?: string
          presentation_style?: string
          template_id?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          video_style?: string | null
          voice_id?: string | null
          voice_provider?: string | null
          voice_speed?: number
          voice_style?: string | null
          wordpress_config_id?: string | null
          youtube_channel_id?: string | null
          youtube_monthly_views?: number | null
          youtube_subs?: number | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_wordpress_config_id_fkey"
            columns: ["wordpress_config_id"]
            isOneToOne: false
            referencedRelation: "wordpress_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_assets: {
        Row: {
          created_at: string
          credits_used: number
          draft_id: string
          id: string
          meta_json: Json
          org_id: string
          position: number | null
          provider: string | null
          type: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          draft_id: string
          id?: string
          meta_json?: Json
          org_id: string
          position?: number | null
          provider?: string | null
          type: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          draft_id?: string
          id?: string
          meta_json?: Json
          org_id?: string
          position?: number | null
          provider?: string | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "content_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_drafts: {
        Row: {
          canonical_core_json: Json | null
          channel_id: string | null
          created_at: string
          draft_json: Json | null
          id: string
          idea_id: string | null
          org_id: string
          production_params: Json | null
          published_at: string | null
          published_url: string | null
          research_session_id: string | null
          review_feedback_json: Json | null
          scheduled_at: string | null
          status: string
          title: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_core_json?: Json | null
          channel_id?: string | null
          created_at?: string
          draft_json?: Json | null
          id?: string
          idea_id?: string | null
          org_id: string
          production_params?: Json | null
          published_at?: string | null
          published_url?: string | null
          research_session_id?: string | null
          review_feedback_json?: Json | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_core_json?: Json | null
          channel_id?: string | null
          created_at?: string
          draft_json?: Json | null
          id?: string
          idea_id?: string | null
          org_id?: string
          production_params?: Json | null
          published_at?: string | null
          published_url?: string | null
          research_session_id?: string | null
          review_feedback_json?: Json | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "idea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_research_session_id_fkey"
            columns: ["research_session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usage: {
        Row: {
          action: string
          category: string
          cost: number
          created_at: string
          id: string
          metadata_json: Json | null
          org_id: string
          source: string
          user_id: string
        }
        Insert: {
          action: string
          category: string
          cost: number
          created_at?: string
          id?: string
          metadata_json?: Json | null
          org_id: string
          source?: string
          user_id: string
        }
        Update: {
          action?: string
          category?: string
          cost?: number
          created_at?: string
          id?: string
          metadata_json?: Json | null
          org_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_archives: {
        Row: {
          brainstorm_session_id: string | null
          channel_id: string | null
          core_tension: string
          created_at: string
          discovery_data: string
          id: string
          idea_id: string
          is_public: boolean
          markdown_content: string | null
          org_id: string | null
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
          brainstorm_session_id?: string | null
          channel_id?: string | null
          core_tension: string
          created_at?: string
          discovery_data: string
          id?: string
          idea_id: string
          is_public?: boolean
          markdown_content?: string | null
          org_id?: string | null
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
          brainstorm_session_id?: string | null
          channel_id?: string | null
          core_tension?: string
          created_at?: string
          discovery_data?: string
          id?: string
          idea_id?: string
          is_public?: boolean
          markdown_content?: string | null
          org_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "idea_archives_brainstorm_session_id_fkey"
            columns: ["brainstorm_session_id"]
            isOneToOne: false
            referencedRelation: "brainstorm_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_archives_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_archives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          provider?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "image_generator_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          session_id: string
          session_type: string
          stage: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          session_id: string
          session_type: string
          stage: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          session_id?: string
          session_type?: string
          stage?: string
        }
        Relationships: []
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          org_id: string
          role?: string
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          credit_limit: number | null
          credits_used_cycle: number
          id: string
          invited_at: string | null
          invited_by: string | null
          org_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          credit_limit?: number | null
          credits_used_cycle?: number
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          credit_limit?: number | null
          credits_used_cycle?: number
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          org_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_cycle: string | null
          created_at: string
          credits_addon: number
          credits_reset_at: string | null
          credits_total: number
          credits_used: number
          id: string
          logo_url: string | null
          name: string
          plan: string
          plan_expires_at: string | null
          plan_started_at: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string
          credits_addon?: number
          credits_reset_at?: string | null
          credits_total?: number
          credits_used?: number
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          plan_expires_at?: string | null
          plan_started_at?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string
          credits_addon?: number
          credits_reset_at?: string | null
          credits_total?: number
          credits_used?: number
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          plan_expires_at?: string | null
          plan_started_at?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          outro?: string
          personal_angle?: string
          project_id?: string | null
          status?: string
          talking_points_json?: string
          updated_at?: string
          user_id?: string | null
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "podcast_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          auto_advance: boolean
          channel_id: string | null
          completed_stages: string[]
          created_at: string
          current_stage: string
          id: string
          org_id: string | null
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
          channel_id?: string | null
          completed_stages?: string[]
          created_at?: string
          current_stage: string
          id?: string
          org_id?: string | null
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
          channel_id?: string | null
          completed_stages?: string[]
          created_at?: string
          current_stage?: string
          id?: string
          org_id?: string | null
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
            foreignKeyName: "projects_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_research_id_fkey"
            columns: ["research_id"]
            isOneToOne: false
            referencedRelation: "research_archives"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_content: {
        Row: {
          comment_count: number | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          engagement_rate: number | null
          external_id: string
          id: string
          like_count: number | null
          published_at: string | null
          reference_id: string
          tags: string[] | null
          title: string
          transcript: string | null
          url: string | null
          view_count: number | null
        }
        Insert: {
          comment_count?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          engagement_rate?: number | null
          external_id: string
          id?: string
          like_count?: number | null
          published_at?: string | null
          reference_id: string
          tags?: string[] | null
          title: string
          transcript?: string | null
          url?: string | null
          view_count?: number | null
        }
        Update: {
          comment_count?: number | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          engagement_rate?: number | null
          external_id?: string
          id?: string
          like_count?: number | null
          published_at?: string | null
          reference_id?: string
          tags?: string[] | null
          title?: string
          transcript?: string | null
          url?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_content_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "channel_references"
            referencedColumns: ["id"]
          },
        ]
      }
      research_archives: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          projects_count?: number
          research_content?: string
          theme?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          winners_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "research_archives_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sessions: {
        Row: {
          approved_cards_json: Json | null
          cards_json: Json | null
          channel_id: string | null
          created_at: string
          error_message: string | null
          focus_tags: string[]
          id: string
          idea_id: string | null
          input_json: Json
          level: string
          model_tier: string
          org_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_cards_json?: Json | null
          cards_json?: Json | null
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          focus_tags?: string[]
          id?: string
          idea_id?: string | null
          input_json?: Json
          level: string
          model_tier?: string
          org_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_cards_json?: Json | null
          cards_json?: Json | null
          channel_id?: string | null
          created_at?: string
          error_message?: string | null
          focus_tags?: string[]
          id?: string
          idea_id?: string | null
          input_json?: Json
          level?: string
          model_tier?: string
          org_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_sessions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_sessions_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "idea_archives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          project_id?: string | null
          short_count?: number
          shorts_json?: string
          status?: string
          total_duration?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shorts_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
          parent_template_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          channel_id: string | null
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          org_id: string
          output_tokens: number
          provider: string
          session_id: string | null
          session_type: string | null
          stage: string
          sub_stage: string | null
          user_id: string | null
        }
        Insert: {
          channel_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          org_id: string
          output_tokens?: number
          provider: string
          session_id?: string | null
          session_type?: string | null
          stage: string
          sub_stage?: string | null
          user_id?: string | null
        }
        Update: {
          channel_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          org_id?: string
          output_tokens?: number
          provider?: string
          session_id?: string | null
          session_type?: string | null
          stage?: string
          sub_stage?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_active: boolean
          is_premium: boolean
          last_name: string | null
          onboarding_completed: boolean
          onboarding_step: string | null
          premium_expires_at: string | null
          premium_plan: string | null
          premium_started_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          is_active?: boolean
          is_premium?: boolean
          last_name?: string | null
          onboarding_completed?: boolean
          onboarding_step?: string | null
          premium_expires_at?: string | null
          premium_plan?: string | null
          premium_started_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean
          is_premium?: boolean
          last_name?: string | null
          onboarding_completed?: boolean
          onboarding_step?: string | null
          premium_expires_at?: string | null
          premium_plan?: string | null
          premium_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: number
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      video_drafts: {
        Row: {
          created_at: string
          id: string
          idea_id: string | null
          org_id: string | null
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
          org_id?: string | null
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
          org_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "video_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wordpress_configs: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          password: string
          site_url: string
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          password: string
          site_url: string
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          password?: string
          site_url?: string
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_niche_analyses: {
        Row: {
          analyzed_at: string
          channel_id: string | null
          created_at: string
          expires_at: string
          id: string
          language: string
          market: string
          niche: string
          opportunities_json: Json | null
          optimal_duration: string | null
          optimal_posting_schedule: string | null
          org_id: string
          reference_channels_json: Json | null
          saturated_topics_json: Json | null
          top_videos_json: Json | null
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          channel_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          language: string
          market: string
          niche: string
          opportunities_json?: Json | null
          optimal_duration?: string | null
          optimal_posting_schedule?: string | null
          org_id: string
          reference_channels_json?: Json | null
          saturated_topics_json?: Json | null
          top_videos_json?: Json | null
          user_id: string
        }
        Update: {
          analyzed_at?: string
          channel_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          market?: string
          niche?: string
          opportunities_json?: Json | null
          optimal_duration?: string | null
          optimal_posting_schedule?: string | null
          org_id?: string
          reference_channels_json?: Json | null
          saturated_topics_json?: Json | null
          top_videos_json?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_niche_analyses_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_niche_analyses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      users_page_growth: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      users_page_kpis: { Args: never; Returns: Json }
      users_page_sparklines: { Args: never; Returns: Json }
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
  public: {
    Enums: {},
  },
} as const
