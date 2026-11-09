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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      actions: {
        Row: {
          asset_id: string | null
          created_at: string
          due_at: string | null
          id: string
          incident_id: string | null
          payload: Json
          status: string
          type: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          incident_id?: string | null
          payload?: Json
          status?: string
          type: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          incident_id?: string | null
          payload?: Json
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          id: string
          line: string
          name: string
          plant_id: string
          type: string
        }
        Insert: {
          id: string
          line: string
          name: string
          plant_id?: string
          type: string
        }
        Update: {
          id?: string
          line?: string
          name?: string
          plant_id?: string
          type?: string
        }
        Relationships: []
      }
      handovers: {
        Row: {
          brief: Json
          created_at: string
          id: string
        }
        Insert: {
          brief: Json
          created_at?: string
          id?: string
        }
        Update: {
          brief?: Json
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          asset_id: string
          batch_no: string | null
          created_at: string
          description: string
          fault_code: string | null
          id: string
          resolved_at: string | null
          severity: string
          status: string
          technician: string | null
          title: string
        }
        Insert: {
          asset_id: string
          batch_no?: string | null
          created_at?: string
          description?: string
          fault_code?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          technician?: string | null
          title: string
        }
        Update: {
          asset_id?: string
          batch_no?: string | null
          created_at?: string
          description?: string
          fault_code?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          technician?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          asset_id: string | null
          content: string
          created_at: string
          id: string
          kind: string
          occurred_at: string
          outcome: string
          tags: string[]
        }
        Insert: {
          asset_id?: string | null
          content: string
          created_at?: string
          id?: string
          kind?: string
          occurred_at?: string
          outcome?: string
          tags?: string[]
        }
        Update: {
          asset_id?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          occurred_at?: string
          outcome?: string
          tags?: string[]
        }
        Relationships: []
      }
      memory_events: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          card: Json | null
          content: string
          created_at: string
          id: string
          incident_id: string
          memories_used: Json | null
          role: string
          tool_calls: Json | null
        }
        Insert: {
          card?: Json | null
          content?: string
          created_at?: string
          id?: string
          incident_id: string
          memories_used?: Json | null
          role: string
          tool_calls?: Json | null
        }
        Update: {
          card?: Json | null
          content?: string
          created_at?: string
          id?: string
          incident_id?: string
          memories_used?: Json | null
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      outcomes: {
        Row: {
          created_at: string
          fix_summary: string
          followup_notes: string | null
          held: boolean | null
          id: string
          incident_id: string
        }
        Insert: {
          created_at?: string
          fix_summary: string
          followup_notes?: string | null
          held?: boolean | null
          id?: string
          incident_id: string
        }
        Update: {
          created_at?: string
          fix_summary?: string
          followup_notes?: string | null
          held?: boolean | null
          id?: string
          incident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_alerts: {
        Row: {
          asset_id: string
          created_at: string
          dismissed: boolean
          id: string
          message: string
          severity: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          dismissed?: boolean
          id?: string
          message: string
          severity?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          dismissed?: boolean
          id?: string
          message?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_alerts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
