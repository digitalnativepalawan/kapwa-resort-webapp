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
      employee_shifts: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          is_paid: boolean
          paid_at: string | null
          total_pay: number | null
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          is_paid?: boolean
          paid_at?: string | null
          total_pay?: number | null
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          is_paid?: boolean
          paid_at?: string | null
          total_pay?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          hourly_rate: number
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hourly_rate?: number
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hourly_rate?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      expense_history: {
        Row: {
          action: string
          created_at: string
          expense_id: string
          field: string | null
          id: string
          new_value: string | null
          old_value: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          expense_id: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          expense_id?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_history_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          ai_confidence: Json | null
          amount: number | null
          category: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          expense_date: string | null
          id: string
          image_url: string | null
          notes: string | null
          pay_period_end: string | null
          pay_period_start: string | null
          pdf_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tax_amount: number | null
          tin: string | null
          vat_type: string | null
          vendor: string | null
        }
        Insert: {
          ai_confidence?: Json | null
          amount?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          expense_date?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          pay_period_end?: string | null
          pay_period_start?: string | null
          pdf_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tax_amount?: number | null
          tin?: string | null
          vat_type?: string | null
          vendor?: string | null
        }
        Update: {
          ai_confidence?: Json | null
          amount?: number | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          expense_date?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          pay_period_end?: string | null
          pay_period_start?: string | null
          pdf_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tax_amount?: number | null
          tin?: string | null
          vat_type?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          cost_per_unit: number
          created_at: string
          current_stock: number
          id: string
          low_stock_threshold: number
          name: string
          unit: string
        }
        Insert: {
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          id?: string
          low_stock_threshold?: number
          name: string
          unit?: string
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          id?: string
          low_stock_threshold?: number
          name?: string
          unit?: string
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          change_qty: number
          created_at: string
          id: string
          ingredient_id: string
          order_id: string | null
          reason: string
        }
        Insert: {
          change_qty?: number
          created_at?: string
          id?: string
          ingredient_id: string
          order_id?: string | null
          reason?: string
        }
        Update: {
          change_qty?: number
          created_at?: string
          id?: string
          ingredient_id?: string
          order_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          available: boolean
          category: string
          created_at: string
          description: string | null
          featured: boolean
          food_cost: number | null
          id: string
          image_url: string | null
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          food_cost?: number | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          available?: boolean
          category?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          food_cost?: number | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      order_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          input_mode: string
          label: string
          placeholder: string | null
          sort_order: number
          source_table: string | null
          type_key: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          input_mode?: string
          label: string
          placeholder?: string | null
          sort_order?: number
          source_table?: string | null
          type_key: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          input_mode?: string
          label?: string
          placeholder?: string | null
          sort_order?: number
          source_table?: string | null
          type_key?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          items: Json
          location_detail: string | null
          order_type: string
          payment_type: string | null
          service_charge: number
          status: string
          tab_id: string | null
          total: number
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          items?: Json
          location_detail?: string | null
          order_type?: string
          payment_type?: string | null
          service_charge?: number
          status?: string
          tab_id?: string | null
          total?: number
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          items?: Json
          location_detail?: string | null
          order_type?: string
          payment_type?: string | null
          service_charge?: number
          status?: string
          tab_id?: string | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_payments: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          paid_at: string
          payment_type: string
          period_end: string | null
          period_start: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_type?: string
          period_end?: string | null
          period_start?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_type?: string
          period_end?: string | null
          period_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          menu_item_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          menu_item_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          menu_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      resort_profile: {
        Row: {
          address: string | null
          contact_name: string | null
          contact_number: string | null
          created_at: string
          email: string | null
          facebook_url: string | null
          google_map_embed: string | null
          google_map_url: string | null
          id: string
          instagram_url: string | null
          logo_size: number | null
          logo_url: string | null
          phone: string | null
          resort_name: string
          tagline: string | null
          tiktok_url: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          google_map_embed?: string | null
          google_map_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_size?: number | null
          logo_url?: string | null
          phone?: string | null
          resort_name?: string
          tagline?: string | null
          tiktok_url?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string
          email?: string | null
          facebook_url?: string | null
          google_map_embed?: string | null
          google_map_url?: string | null
          id?: string
          instagram_url?: string | null
          logo_size?: number | null
          logo_url?: string | null
          phone?: string | null
          resort_name?: string
          tagline?: string | null
          tiktok_url?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      resort_tables: {
        Row: {
          active: boolean
          created_at: string
          id: string
          table_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          table_name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          table_name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          breakfast_end_time: string | null
          breakfast_start_time: string | null
          created_at: string
          id: string
          kitchen_whatsapp_number: string
          updated_at: string
        }
        Insert: {
          breakfast_end_time?: string | null
          breakfast_start_time?: string | null
          created_at?: string
          id?: string
          kitchen_whatsapp_number?: string
          updated_at?: string
        }
        Update: {
          breakfast_end_time?: string | null
          breakfast_start_time?: string | null
          created_at?: string
          id?: string
          kitchen_whatsapp_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      tabs: {
        Row: {
          closed_at: string | null
          created_at: string
          guest_name: string | null
          id: string
          location_detail: string
          location_type: string
          payment_method: string | null
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          location_detail?: string
          location_type?: string
          payment_method?: string | null
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          location_detail?: string
          location_type?: string
          payment_method?: string | null
          status?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          unit_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          unit_name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          unit_name?: string
        }
        Relationships: []
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
