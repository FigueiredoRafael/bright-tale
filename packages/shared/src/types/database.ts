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
      affiliate_clicks: {
        Row: {
          affiliate_code: string
          affiliate_id: string
          converted_at: string | null
          converted_user_id: string | null
          created_at: string
          device_type: string | null
          id: string
          ip_hash: string | null
          landing_url: string | null
          source_platform: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          affiliate_code: string
          affiliate_id: string
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          landing_url?: string | null
          source_platform?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          affiliate_code?: string
          affiliate_id?: string
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_hash?: string | null
          landing_url?: string | null
          source_platform?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_clicks_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_commissions: {
        Row: {
          affiliate_code: string
          affiliate_id: string
          commission_brl: number
          commission_rate: number
          created_at: string
          fixed_fee_brl: number | null
          id: string
          net_amount: number
          payment_amount: number
          payment_type: string
          payout_id: string | null
          referral_id: string
          status: string
          stripe_fee: number
          total_brl: number
          user_id: string | null
        }
        Insert: {
          affiliate_code: string
          affiliate_id: string
          commission_brl: number
          commission_rate: number
          created_at?: string
          fixed_fee_brl?: number | null
          id?: string
          net_amount: number
          payment_amount: number
          payment_type: string
          payout_id?: string | null
          referral_id: string
          status?: string
          stripe_fee?: number
          total_brl: number
          user_id?: string | null
        }
        Update: {
          affiliate_code?: string
          affiliate_id?: string
          commission_brl?: number
          commission_rate?: number
          created_at?: string
          fixed_fee_brl?: number | null
          id?: string
          net_amount?: number
          payment_amount?: number
          payment_type?: string
          payout_id?: string | null
          referral_id?: string
          status?: string
          stripe_fee?: number
          total_brl?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_content_submissions: {
        Row: {
          affiliate_id: string
          content_type: string
          created_at: string
          description: string | null
          id: string
          platform: string
          posted_at: string | null
          review_notes: string | null
          status: string
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          affiliate_id: string
          content_type: string
          created_at?: string
          description?: string | null
          id?: string
          platform: string
          posted_at?: string | null
          review_notes?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          affiliate_id?: string
          content_type?: string
          created_at?: string
          description?: string | null
          id?: string
          platform?: string
          posted_at?: string | null
          review_notes?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_content_submissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_contract_history: {
        Row: {
          accepted_ip: string | null
          accepted_ua: string | null
          action: string
          affiliate_id: string
          contract_version: number | null
          created_at: string
          id: string
          new_commission_rate: number | null
          new_fixed_fee_brl: number | null
          new_status: string | null
          new_tier: string | null
          notes: string | null
          old_commission_rate: number | null
          old_fixed_fee_brl: number | null
          old_status: string | null
          old_tier: string | null
          performed_by: string | null
        }
        Insert: {
          accepted_ip?: string | null
          accepted_ua?: string | null
          action: string
          affiliate_id: string
          contract_version?: number | null
          created_at?: string
          id?: string
          new_commission_rate?: number | null
          new_fixed_fee_brl?: number | null
          new_status?: string | null
          new_tier?: string | null
          notes?: string | null
          old_commission_rate?: number | null
          old_fixed_fee_brl?: number | null
          old_status?: string | null
          old_tier?: string | null
          performed_by?: string | null
        }
        Update: {
          accepted_ip?: string | null
          accepted_ua?: string | null
          action?: string
          affiliate_id?: string
          contract_version?: number | null
          created_at?: string
          id?: string
          new_commission_rate?: number | null
          new_fixed_fee_brl?: number | null
          new_status?: string | null
          new_tier?: string | null
          notes?: string | null
          old_commission_rate?: number | null
          old_fixed_fee_brl?: number | null
          old_status?: string | null
          old_tier?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_contract_history_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_fraud_flags: {
        Row: {
          admin_notes: string | null
          affiliate_id: string
          created_at: string
          details: Json
          flag_type: string
          id: string
          referral_id: string | null
          resolved_at: string | null
          severity: string
          status: string
        }
        Insert: {
          admin_notes?: string | null
          affiliate_id: string
          created_at?: string
          details?: Json
          flag_type: string
          id?: string
          referral_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Update: {
          admin_notes?: string | null
          affiliate_id?: string
          created_at?: string
          details?: Json
          flag_type?: string
          id?: string
          referral_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_fraud_flags_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_fraud_flags_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "affiliate_referrals_legacy"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          admin_notes: string | null
          affiliate_code: string
          affiliate_id: string
          commission_ids: string[]
          completed_at: string | null
          id: string
          payment_reference: string | null
          pix_key_id: string | null
          pix_key_type: string | null
          pix_key_value: string | null
          requested_at: string
          reviewed_at: string | null
          status: string
          tax_id: string | null
          tax_id_type: string | null
          total_brl: number
        }
        Insert: {
          admin_notes?: string | null
          affiliate_code: string
          affiliate_id: string
          commission_ids?: string[]
          completed_at?: string | null
          id?: string
          payment_reference?: string | null
          pix_key_id?: string | null
          pix_key_type?: string | null
          pix_key_value?: string | null
          requested_at?: string
          reviewed_at?: string | null
          status?: string
          tax_id?: string | null
          tax_id_type?: string | null
          total_brl: number
        }
        Update: {
          admin_notes?: string | null
          affiliate_code?: string
          affiliate_id?: string
          commission_ids?: string[]
          completed_at?: string | null
          id?: string
          payment_reference?: string | null
          pix_key_id?: string | null
          pix_key_type?: string | null
          pix_key_value?: string | null
          requested_at?: string
          reviewed_at?: string | null
          status?: string
          tax_id?: string | null
          tax_id_type?: string | null
          total_brl?: number
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_pix_keys: {
        Row: {
          affiliate_id: string
          created_at: string
          id: string
          is_default: boolean
          key_display: string
          key_type: string
          key_value: string
          label: string | null
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          key_display: string
          key_type: string
          key_value: string
          label?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          key_display?: string
          key_type?: string
          key_value?: string
          label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_pix_keys_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals: {
        Row: {
          affiliate_code: string
          affiliate_id: string
          attribution_status: string
          click_id: string | null
          converted_at: string | null
          created_at: string
          id: string
          platform: string | null
          signup_date: string
          signup_ip_hash: string | null
          user_id: string
          window_end: string
        }
        Insert: {
          affiliate_code: string
          affiliate_id: string
          attribution_status?: string
          click_id?: string | null
          converted_at?: string | null
          created_at?: string
          id?: string
          platform?: string | null
          signup_date?: string
          signup_ip_hash?: string | null
          user_id: string
          window_end?: string
        }
        Update: {
          affiliate_code?: string
          affiliate_id?: string
          attribution_status?: string
          click_id?: string | null
          converted_at?: string | null
          created_at?: string
          id?: string
          platform?: string | null
          signup_date?: string
          signup_ip_hash?: string | null
          user_id?: string
          window_end?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey1"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_click_id_fkey1"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "affiliate_clicks"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_referrals_legacy: {
        Row: {
          affiliate_code: string
          affiliate_id: string
          attribution_status: string
          click_id: string | null
          converted_at: string | null
          created_at: string
          id: string
          platform: string | null
          signup_date: string
          signup_ip_hash: string | null
          user_id: string
          window_end: string
        }
        Insert: {
          affiliate_code: string
          affiliate_id: string
          attribution_status?: string
          click_id?: string | null
          converted_at?: string | null
          created_at?: string
          id?: string
          platform?: string | null
          signup_date?: string
          signup_ip_hash?: string | null
          user_id: string
          window_end?: string
        }
        Update: {
          affiliate_code?: string
          affiliate_id?: string
          attribution_status?: string
          click_id?: string | null
          converted_at?: string | null
          created_at?: string
          id?: string
          platform?: string | null
          signup_date?: string
          signup_ip_hash?: string | null
          user_id?: string
          window_end?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_referrals_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "affiliate_clicks"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_risk_scores: {
        Row: {
          affiliate_id: string
          flag_count: number
          score: number
          updated_at: string
        }
        Insert: {
          affiliate_id: string
          flag_count?: number
          score?: number
          updated_at?: string
        }
        Update: {
          affiliate_id?: string
          flag_count?: number
          score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_risk_scores_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: true
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          adjusted_followers: number | null
          affiliate_type: string
          channel_name: string | null
          channel_platform: string | null
          channel_url: string | null
          code: string
          commission_rate: number
          contract_acceptance_version: number | null
          contract_accepted_at: string | null
          contract_accepted_ip: string | null
          contract_accepted_ua: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          contract_version: number
          created_at: string
          email: string
          fixed_fee_brl: number | null
          id: string
          known_ip_hashes: string[] | null
          name: string
          notes: string | null
          proposal_created_at: string | null
          proposal_notes: string | null
          proposed_commission_rate: number | null
          proposed_fixed_fee_brl: number | null
          proposed_tier: string | null
          social_links: Json | null
          status: string
          subscribers_count: number | null
          tax_id: string | null
          tier: string
          total_clicks: number
          total_conversions: number
          total_earnings_brl: number
          total_referrals: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          adjusted_followers?: number | null
          affiliate_type?: string
          channel_name?: string | null
          channel_platform?: string | null
          channel_url?: string | null
          code: string
          commission_rate?: number
          contract_acceptance_version?: number | null
          contract_accepted_at?: string | null
          contract_accepted_ip?: string | null
          contract_accepted_ua?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_version?: number
          created_at?: string
          email: string
          fixed_fee_brl?: number | null
          id?: string
          known_ip_hashes?: string[] | null
          name: string
          notes?: string | null
          proposal_created_at?: string | null
          proposal_notes?: string | null
          proposed_commission_rate?: number | null
          proposed_fixed_fee_brl?: number | null
          proposed_tier?: string | null
          social_links?: Json | null
          status?: string
          subscribers_count?: number | null
          tax_id?: string | null
          tier?: string
          total_clicks?: number
          total_conversions?: number
          total_earnings_brl?: number
          total_referrals?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          adjusted_followers?: number | null
          affiliate_type?: string
          channel_name?: string | null
          channel_platform?: string | null
          channel_url?: string | null
          code?: string
          commission_rate?: number
          contract_acceptance_version?: number | null
          contract_accepted_at?: string | null
          contract_accepted_ip?: string | null
          contract_accepted_ua?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_version?: number
          created_at?: string
          email?: string
          fixed_fee_brl?: number | null
          id?: string
          known_ip_hashes?: string[] | null
          name?: string
          notes?: string | null
          proposal_created_at?: string | null
          proposal_notes?: string | null
          proposed_commission_rate?: number | null
          proposed_fixed_fee_brl?: number | null
          proposed_tier?: string | null
          social_links?: Json | null
          status?: string
          subscribers_count?: number | null
          tax_id?: string | null
          tier?: string
          total_clicks?: number
          total_conversions?: number
          total_earnings_brl?: number
          total_referrals?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
          sections_json: Json | null
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
          sections_json?: Json | null
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
          sections_json?: Json | null
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
          webp_url: string | null
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
          webp_url?: string | null
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
          webp_url?: string | null
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
          project_id: string | null
          recommendation_json: Json | null
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
          project_id?: string | null
          recommendation_json?: Json | null
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
          project_id?: string | null
          recommendation_json?: Json | null
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
          {
            foreignKeyName: "brainstorm_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      channel_personas: {
        Row: {
          channel_id: string
          created_at: string
          is_primary: boolean
          persona_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          is_primary?: boolean
          persona_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          is_primary?: boolean
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_personas_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_personas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
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
          region: string
          template_id: string | null
          tone: string | null
          updated_at: string
          user_id: string
          video_style: string | null
          voice_id: string | null
          voice_provider: string | null
          voice_speed: number
          voice_style: string | null
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
          region?: string
          template_id?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          video_style?: string | null
          voice_id?: string | null
          voice_provider?: string | null
          voice_speed?: number
          voice_style?: string | null
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
          region?: string
          template_id?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          video_style?: string | null
          voice_id?: string | null
          voice_provider?: string | null
          voice_speed?: number
          voice_style?: string | null
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
        ]
      }
      content_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          credits_used: number
          draft_id: string
          id: string
          meta_json: Json
          org_id: string
          position: number | null
          provider: string | null
          role: string | null
          source_type: string | null
          type: string
          updated_at: string
          url: string
          user_id: string
          webp_url: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          credits_used?: number
          draft_id: string
          id?: string
          meta_json?: Json
          org_id: string
          position?: number | null
          provider?: string | null
          role?: string | null
          source_type?: string | null
          type: string
          updated_at?: string
          url: string
          user_id: string
          webp_url?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          credits_used?: number
          draft_id?: string
          id?: string
          meta_json?: Json
          org_id?: string
          position?: number | null
          provider?: string | null
          role?: string | null
          source_type?: string | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
          webp_url?: string | null
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
          approved_at: string | null
          canonical_core_json: Json | null
          channel_id: string | null
          created_at: string
          draft_json: Json | null
          id: string
          idea_id: string | null
          iteration_count: number
          org_id: string
          persona_id: string | null
          production_params: Json | null
          production_settings_json: Json | null
          project_id: string | null
          published_at: string | null
          published_url: string | null
          research_session_id: string | null
          review_feedback_json: Json | null
          review_score: number | null
          review_verdict: string | null
          scheduled_at: string | null
          status: string
          title: string | null
          type: string
          updated_at: string
          user_id: string
          wordpress_post_id: number | null
        }
        Insert: {
          approved_at?: string | null
          canonical_core_json?: Json | null
          channel_id?: string | null
          created_at?: string
          draft_json?: Json | null
          id?: string
          idea_id?: string | null
          iteration_count?: number
          org_id: string
          persona_id?: string | null
          production_params?: Json | null
          production_settings_json?: Json | null
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          research_session_id?: string | null
          review_feedback_json?: Json | null
          review_score?: number | null
          review_verdict?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          type: string
          updated_at?: string
          user_id: string
          wordpress_post_id?: number | null
        }
        Update: {
          approved_at?: string | null
          canonical_core_json?: Json | null
          channel_id?: string | null
          created_at?: string
          draft_json?: Json | null
          id?: string
          idea_id?: string | null
          iteration_count?: number
          org_id?: string
          persona_id?: string | null
          production_params?: Json | null
          production_settings_json?: Json | null
          project_id?: string | null
          published_at?: string | null
          published_url?: string | null
          research_session_id?: string | null
          review_feedback_json?: Json | null
          review_score?: number | null
          review_verdict?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          wordpress_post_id?: number | null
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
            foreignKeyName: "content_drafts_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      credit_settings: {
        Row: {
          cost_blog: number
          cost_canonical_core: number
          cost_podcast: number
          cost_review: number
          cost_shorts: number
          cost_video: number
          created_at: string
          id: string
          lock_key: string
          updated_at: string
        }
        Insert: {
          cost_blog?: number
          cost_canonical_core?: number
          cost_podcast?: number
          cost_review?: number
          cost_shorts?: number
          cost_video?: number
          created_at?: string
          id?: string
          lock_key?: string
          updated_at?: string
        }
        Update: {
          cost_blog?: number
          cost_canonical_core?: number
          cost_podcast?: number
          cost_review?: number
          cost_shorts?: number
          cost_video?: number
          created_at?: string
          id?: string
          lock_key?: string
          updated_at?: string
        }
        Relationships: []
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
      engine_logs: {
        Row: {
          channel_id: string | null
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          input_json: Json
          input_tokens: number | null
          model: string
          org_id: string | null
          output_json: Json | null
          output_tokens: number | null
          project_id: string | null
          provider: string
          session_id: string | null
          session_type: string
          stage: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          input_json: Json
          input_tokens?: number | null
          model: string
          org_id?: string | null
          output_json?: Json | null
          output_tokens?: number | null
          project_id?: string | null
          provider: string
          session_id?: string | null
          session_type: string
          stage: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          input_json?: Json
          input_tokens?: number | null
          model?: string
          org_id?: string | null
          output_json?: Json | null
          output_tokens?: number | null
          project_id?: string | null
          provider?: string
          session_id?: string | null
          session_type?: string
          stage?: string
          user_id?: string
        }
        Relationships: []
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
          project_id: string | null
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
          project_id?: string | null
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
          project_id?: string | null
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
          {
            foreignKeyName: "idea_archives_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      managers: {
        Row: {
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          department: string | null
          display_name: string | null
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          last_login_at: string | null
          notes: string | null
          role: Database["public"]["Enums"]["manager_role"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          department?: string | null
          display_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["manager_role"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          department?: string | null
          display_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["manager_role"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      managers_audit_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event: Database["public"]["Enums"]["managers_audit_event"]
          id: number
          ip_hash: string | null
          manager_id: string | null
          metadata: Json
          new_role: Database["public"]["Enums"]["manager_role"] | null
          old_role: Database["public"]["Enums"]["manager_role"] | null
          target_user_id: string
          ua_hash: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event: Database["public"]["Enums"]["managers_audit_event"]
          id?: number
          ip_hash?: string | null
          manager_id?: string | null
          metadata?: Json
          new_role?: Database["public"]["Enums"]["manager_role"] | null
          old_role?: Database["public"]["Enums"]["manager_role"] | null
          target_user_id: string
          ua_hash?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event?: Database["public"]["Enums"]["managers_audit_event"]
          id?: number
          ip_hash?: string | null
          manager_id?: string | null
          metadata?: Json
          new_role?: Database["public"]["Enums"]["manager_role"] | null
          old_role?: Database["public"]["Enums"]["manager_role"] | null
          target_user_id?: string
          ua_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "managers_audit_log_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
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
          is_vip: boolean
          logo_url: string | null
          name: string
          plan: string
          plan_expires_at: string | null
          plan_started_at: string | null
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          vip_note: string | null
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string
          credits_addon?: number
          credits_reset_at?: string | null
          credits_total?: number
          credits_used?: number
          id?: string
          is_vip?: boolean
          logo_url?: string | null
          name: string
          plan?: string
          plan_expires_at?: string | null
          plan_started_at?: string | null
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          vip_note?: string | null
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string
          credits_addon?: number
          credits_reset_at?: string | null
          credits_total?: number
          credits_used?: number
          id?: string
          is_vip?: boolean
          logo_url?: string | null
          name?: string
          plan?: string
          plan_expires_at?: string | null
          plan_started_at?: string | null
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          vip_note?: string | null
        }
        Relationships: []
      }
      persona_archetypes: {
        Row: {
          behavioral_overlay_json: Json
          created_at: string
          default_fields_json: Json
          description: string
          icon: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          behavioral_overlay_json?: Json
          created_at?: string
          default_fields_json?: Json
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          behavioral_overlay_json?: Json
          created_at?: string
          default_fields_json?: Json
          description?: string
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      persona_guardrails: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          rule_text: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          rule_text: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          rule_text?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          approved_categories: string[]
          archetype_slug: string | null
          avatar_params_json: Json | null
          avatar_url: string | null
          bio_long: string
          bio_short: string
          created_at: string
          domain_lens: string
          eeat_signals_json: Json
          id: string
          is_active: boolean
          name: string
          primary_domain: string
          slug: string
          soul_json: Json
          updated_at: string
          wp_author_id: number | null
          writing_voice_json: Json
        }
        Insert: {
          approved_categories: string[]
          archetype_slug?: string | null
          avatar_params_json?: Json | null
          avatar_url?: string | null
          bio_long: string
          bio_short: string
          created_at?: string
          domain_lens: string
          eeat_signals_json: Json
          id?: string
          is_active?: boolean
          name: string
          primary_domain: string
          slug: string
          soul_json: Json
          updated_at?: string
          wp_author_id?: number | null
          writing_voice_json: Json
        }
        Update: {
          approved_categories?: string[]
          archetype_slug?: string | null
          avatar_params_json?: Json | null
          avatar_url?: string | null
          bio_long?: string
          bio_short?: string
          created_at?: string
          domain_lens?: string
          eeat_signals_json?: Json
          id?: string
          is_active?: boolean
          name?: string
          primary_domain?: string
          slug?: string
          soul_json?: Json
          updated_at?: string
          wp_author_id?: number | null
          writing_voice_json?: Json
        }
        Relationships: []
      }
      pipeline_settings: {
        Row: {
          created_at: string
          default_providers_json: Json
          id: string
          lock_key: string
          review_approve_score: number
          review_max_iterations: number
          review_reject_threshold: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_providers_json?: Json
          id?: string
          lock_key?: string
          review_approve_score?: number
          review_max_iterations?: number
          review_reject_threshold?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_providers_json?: Json
          id?: string
          lock_key?: string
          review_approve_score?: number
          review_max_iterations?: number
          review_reject_threshold?: number
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
          pipeline_state_json: Json | null
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
          pipeline_state_json?: Json | null
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
          pipeline_state_json?: Json | null
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
      publishing_destinations: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          label: string
          last_error: string | null
          last_published_at: string | null
          org_id: string
          publish_count: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          label: string
          last_error?: string | null
          last_published_at?: string | null
          org_id: string
          publish_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          label?: string
          last_error?: string | null
          last_published_at?: string | null
          org_id?: string
          publish_count?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publishing_destinations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      reference_notifications: {
        Row: {
          body: string | null
          channel_id: string
          content_id: string | null
          created_at: string
          dismissed_at: string | null
          id: string
          metadata_json: Json | null
          org_id: string
          read_at: string | null
          reference_id: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel_id: string
          content_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          metadata_json?: Json | null
          org_id: string
          read_at?: string | null
          reference_id: string
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel_id?: string
          content_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          id?: string
          metadata_json?: Json | null
          org_id?: string
          read_at?: string | null
          reference_id?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_notifications_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "reference_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_notifications_reference_id_fkey"
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
          pivot_applied: boolean | null
          project_id: string | null
          refined_angle_json: Json | null
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
          pivot_applied?: boolean | null
          project_id?: string | null
          refined_angle_json?: Json | null
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
          pivot_applied?: boolean | null
          project_id?: string | null
          refined_angle_json?: Json | null
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
          {
            foreignKeyName: "research_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      review_iterations: {
        Row: {
          created_at: string
          draft_id: string
          feedback_json: Json | null
          id: string
          iteration: number
          score: number | null
          verdict: string | null
        }
        Insert: {
          created_at?: string
          draft_id: string
          feedback_json?: Json | null
          id?: string
          iteration: number
          score?: number | null
          verdict?: string | null
        }
        Update: {
          created_at?: string
          draft_id?: string
          feedback_json?: Json | null
          id?: string
          iteration?: number
          score?: number | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_iterations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "content_drafts"
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
          channel_id: string
          created_at: string
          id: string
          password: string
          site_url: string
          updated_at: string
          username: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          password: string
          site_url: string
          updated_at?: string
          username: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          password?: string
          site_url?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "wordpress_configs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
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
      increment_affiliate_clicks: {
        Args: { aff_id: string }
        Returns: undefined
      }
      increment_affiliate_conversions: {
        Args: { aff_id: string; earnings_brl: number }
        Returns: undefined
      }
      increment_affiliate_referrals: {
        Args: { aff_id: string }
        Returns: undefined
      }
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
      manager_role: "owner" | "admin" | "support" | "billing" | "readonly"
      managers_audit_event:
        | "invited"
        | "role_changed"
        | "metadata_changed"
        | "deactivated"
        | "reactivated"
        | "removed"
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
    Enums: {
      manager_role: ["owner", "admin", "support", "billing", "readonly"],
      managers_audit_event: [
        "invited",
        "role_changed",
        "metadata_changed",
        "deactivated",
        "reactivated",
        "removed",
      ],
    },
  },
} as const
