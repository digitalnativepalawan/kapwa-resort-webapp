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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      app_options: {
        Row: {
          category: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      asset_categories: {
        Row: {
          created_at: string | null
          department: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          department: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          department?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      asset_transactions: {
        Row: {
          asset_id: string | null
          created_at: string | null
          id: string
          performed_by: string | null
          quantity_change: number
          reason: string | null
          transaction_type: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string | null
          id?: string
          performed_by?: string | null
          quantity_change: number
          reason?: string | null
          transaction_type?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string | null
          id?: string
          performed_by?: string | null
          quantity_change?: number
          reason?: string | null
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          breakage_count: number | null
          category_id: string | null
          created_at: string | null
          current_quantity: number
          department: string | null
          id: string
          last_restocked: string | null
          min_quantity: number
          name: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          breakage_count?: number | null
          category_id?: string | null
          created_at?: string | null
          current_quantity?: number
          department?: string | null
          id?: string
          last_restocked?: string | null
          min_quantity?: number
          name: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          breakage_count?: number | null
          category_id?: string | null
          created_at?: string | null
          current_quantity?: number
          department?: string | null
          id?: string
          last_restocked?: string | null
          min_quantity?: number
          name?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "asset_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: string
          employee_id: string | null
          employee_name: string
          id: string
          record_id: string
          table_name: string
        }
        Insert: {
          action?: string
          created_at?: string
          details?: string
          employee_id?: string | null
          employee_name?: string
          id?: string
          record_id?: string
          table_name?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string
          employee_id?: string | null
          employee_name?: string
          id?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      bill_disputes: {
        Row: {
          booking_id: string
          created_at: string
          guest_message: string
          guest_name: string
          id: string
          resolved_at: string | null
          responded_by: string
          room_id: string | null
          staff_response: string
          status: string
          unit_name: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          guest_message?: string
          guest_name?: string
          id?: string
          resolved_at?: string | null
          responded_by?: string
          room_id?: string | null
          staff_response?: string
          status?: string
          unit_name?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          guest_message?: string
          guest_name?: string
          id?: string
          resolved_at?: string | null
          responded_by?: string
          room_id?: string | null
          staff_response?: string
          status?: string
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_disputes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_config: {
        Row: {
          allow_room_charging: boolean
          city_tax_name: string
          city_tax_rate: number
          created_at: string
          default_payment_method: string
          enable_city_tax: boolean
          enable_service_charge: boolean
          enable_tax: boolean
          id: string
          notify_charges_above: number
          receipt_footer: string
          receipt_header: string
          require_deposit: boolean
          require_signature_above: number
          service_charge_name: string
          service_charge_rate: number
          show_itemized_taxes: boolean
          show_payment_on_receipt: boolean
          show_room_on_receipt: boolean
          show_staff_on_receipt: boolean
          tax_name: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          allow_room_charging?: boolean
          city_tax_name?: string
          city_tax_rate?: number
          created_at?: string
          default_payment_method?: string
          enable_city_tax?: boolean
          enable_service_charge?: boolean
          enable_tax?: boolean
          id?: string
          notify_charges_above?: number
          receipt_footer?: string
          receipt_header?: string
          require_deposit?: boolean
          require_signature_above?: number
          service_charge_name?: string
          service_charge_rate?: number
          show_itemized_taxes?: boolean
          show_payment_on_receipt?: boolean
          show_room_on_receipt?: boolean
          show_staff_on_receipt?: boolean
          tax_name?: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          allow_room_charging?: boolean
          city_tax_name?: string
          city_tax_rate?: number
          created_at?: string
          default_payment_method?: string
          enable_city_tax?: boolean
          enable_service_charge?: boolean
          enable_tax?: boolean
          id?: string
          notify_charges_above?: number
          receipt_footer?: string
          receipt_header?: string
          require_deposit?: boolean
          require_signature_above?: number
          service_charge_name?: string
          service_charge_rate?: number
          show_itemized_taxes?: boolean
          show_payment_on_receipt?: boolean
          show_room_on_receipt?: boolean
          show_staff_on_receipt?: boolean
          tax_name?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      breakfast_orders: {
        Row: {
          created_at: string | null
          date: string
          guest_name: string | null
          id: string
          order_items: string | null
          pax: number | null
          requested_time: string | null
          room_name: string
        }
        Insert: {
          created_at?: string | null
          date: string
          guest_name?: string | null
          id?: string
          order_items?: string | null
          pax?: number | null
          requested_time?: string | null
          room_name: string
        }
        Update: {
          created_at?: string | null
          date?: string
          guest_name?: string | null
          id?: string
          order_items?: string | null
          pax?: number | null
          requested_time?: string | null
          room_name?: string
        }
        Relationships: []
      }
      cleaning_package_items: {
        Row: {
          created_at: string
          default_quantity: number
          id: string
          ingredient_id: string
          package_id: string
        }
        Insert: {
          created_at?: string
          default_quantity?: number
          id?: string
          ingredient_id: string
          package_id: string
        }
        Update: {
          created_at?: string
          default_quantity?: number
          id?: string
          ingredient_id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_package_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "cleaning_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_packages: {
        Row: {
          created_at: string
          id: string
          name: string
          room_type_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          room_type_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_packages_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefing: {
        Row: {
          created_at: string | null
          date: string
          id: number
          notes: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: number
          notes?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: number
          notes?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          department: string
          device_id: string
          device_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          last_login_employee_id: string | null
        }
        Insert: {
          created_at?: string
          department?: string
          device_id: string
          device_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          last_login_employee_id?: string | null
        }
        Update: {
          created_at?: string
          department?: string
          device_id?: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          last_login_employee_id?: string | null
        }
        Relationships: []
      }
      dining_reservations: {
        Row: {
          contact_number: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          guest_name: string
          id: string
          notes: string | null
          occasion: string | null
          pax: number
          pre_orders: Json | null
          reservation_date: string
          reservation_time: string
          reservation_type: string | null
          status: string | null
        }
        Insert: {
          contact_number?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          guest_name: string
          id?: string
          notes?: string | null
          occasion?: string | null
          pax?: number
          pre_orders?: Json | null
          reservation_date: string
          reservation_time: string
          reservation_type?: string | null
          status?: string | null
        }
        Update: {
          contact_number?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          guest_name?: string
          id?: string
          notes?: string | null
          occasion?: string | null
          pax?: number
          pre_orders?: Json | null
          reservation_date?: string
          reservation_time?: string
          reservation_type?: string | null
          status?: string | null
        }
        Relationships: []
      }
      employee_bonuses: {
        Row: {
          amount: number
          bonus_month: string | null
          created_at: string
          employee_id: string
          id: string
          is_employee_of_month: boolean
          reason: string
        }
        Insert: {
          amount?: number
          bonus_month?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_employee_of_month?: boolean
          reason?: string
        }
        Update: {
          amount?: number
          bonus_month?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_employee_of_month?: boolean
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_bonuses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          permission: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          permission: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          permission?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_roles: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          role_key: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          role_key: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_roles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
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
      employee_tasks: {
        Row: {
          archived_at: string | null
          completed_at: string | null
          completion_meta: Json | null
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          employee_id: string
          id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          completed_at?: string | null
          completion_meta?: Json | null
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          employee_id: string
          id?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          completed_at?: string | null
          completion_meta?: Json | null
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          employee_id?: string
          id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_tasks_employee_id_fkey"
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
          daily_rate: number
          display_name: string
          hourly_rate: number
          id: string
          messenger_link: string
          monthly_rate: number
          name: string
          password_hash: string
          phone: string
          preferred_contact_method: string
          rate_type: string
          whatsapp_number: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_rate?: number
          display_name?: string
          hourly_rate?: number
          id?: string
          messenger_link?: string
          monthly_rate?: number
          name: string
          password_hash?: string
          phone?: string
          preferred_contact_method?: string
          rate_type?: string
          whatsapp_number?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_rate?: number
          display_name?: string
          hourly_rate?: number
          id?: string
          messenger_link?: string
          monthly_rate?: number
          name?: string
          password_hash?: string
          phone?: string
          preferred_contact_method?: string
          rate_type?: string
          whatsapp_number?: string
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
      guest_documents: {
        Row: {
          created_at: string
          document_type: string
          guest_id: string | null
          id: string
          image_url: string
          notes: string | null
          unit_name: string
        }
        Insert: {
          created_at?: string
          document_type?: string
          guest_id?: string | null
          id?: string
          image_url: string
          notes?: string | null
          unit_name?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          guest_id?: string | null
          id?: string
          image_url?: string
          notes?: string | null
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_documents_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_notes: {
        Row: {
          booking_id: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          note_type: string
          unit_name: string
        }
        Insert: {
          booking_id?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          note_type?: string
          unit_name?: string
        }
        Update: {
          booking_id?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          note_type?: string
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_requests: {
        Row: {
          booking_id: string | null
          confirmed_by: string
          created_at: string
          details: string
          guest_name: string
          id: string
          request_type: string
          room_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          confirmed_by?: string
          created_at?: string
          details?: string
          guest_name?: string
          id?: string
          request_type?: string
          room_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          confirmed_by?: string
          created_at?: string
          details?: string
          guest_name?: string
          id?: string
          request_type?: string
          room_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_requests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_reviews: {
        Row: {
          booking_id: string | null
          comments: string
          confirmed_by: string
          created_at: string
          guest_name: string
          id: string
          ratings: Json
          room_id: string | null
        }
        Insert: {
          booking_id?: string | null
          comments?: string
          confirmed_by?: string
          created_at?: string
          guest_name?: string
          id?: string
          ratings?: Json
          room_id?: string | null
        }
        Update: {
          booking_id?: string | null
          comments?: string
          confirmed_by?: string
          created_at?: string
          guest_name?: string
          id?: string
          ratings?: Json
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_reviews_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_tours: {
        Row: {
          booking_id: string | null
          confirmed_by: string
          created_at: string
          id: string
          notes: string | null
          pax: number
          pickup_time: string
          price: number
          provider: string
          status: string
          tour_date: string
          tour_name: string
          unit_name: string
        }
        Insert: {
          booking_id?: string | null
          confirmed_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          pax?: number
          pickup_time?: string
          price?: number
          provider?: string
          status?: string
          tour_date?: string
          tour_name?: string
          unit_name?: string
        }
        Update: {
          booking_id?: string | null
          confirmed_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          pax?: number
          pickup_time?: string
          price?: number
          provider?: string
          status?: string
          tour_date?: string
          tour_name?: string
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_tours_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_vibe_records: {
        Row: {
          age_range: string[]
          arrival_energy: string[]
          checked_out: boolean
          checkin_date: string
          checkout_date: string | null
          checkout_notes: string
          checkout_outcome: string
          communication_style: string[]
          created_at: string
          early_signals: string[]
          food_allergies: string
          guest_name: string
          gut_feeling: string[]
          id: string
          medical_conditions: string
          mood_state: string[]
          nationality: string
          personal_preferences: string
          personality_type: string[]
          review_risk_level: string[]
          review_status: string
          special_context: string[]
          staff_notes: string
          travel_composition: string[]
          unit_name: string
          updated_at: string
        }
        Insert: {
          age_range?: string[]
          arrival_energy?: string[]
          checked_out?: boolean
          checkin_date?: string
          checkout_date?: string | null
          checkout_notes?: string
          checkout_outcome?: string
          communication_style?: string[]
          created_at?: string
          early_signals?: string[]
          food_allergies?: string
          guest_name?: string
          gut_feeling?: string[]
          id?: string
          medical_conditions?: string
          mood_state?: string[]
          nationality?: string
          personal_preferences?: string
          personality_type?: string[]
          review_risk_level?: string[]
          review_status?: string
          special_context?: string[]
          staff_notes?: string
          travel_composition?: string[]
          unit_name?: string
          updated_at?: string
        }
        Update: {
          age_range?: string[]
          arrival_energy?: string[]
          checked_out?: boolean
          checkin_date?: string
          checkout_date?: string | null
          checkout_notes?: string
          checkout_outcome?: string
          communication_style?: string[]
          created_at?: string
          early_signals?: string[]
          food_allergies?: string
          guest_name?: string
          gut_feeling?: string[]
          id?: string
          medical_conditions?: string
          mood_state?: string[]
          nationality?: string
          personal_preferences?: string
          personality_type?: string[]
          review_risk_level?: string[]
          review_status?: string
          special_context?: string[]
          staff_notes?: string
          travel_composition?: string[]
          unit_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hermes_conversations: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          messages: Json
          session_id: string | null
          updated_at: string
          user_id: string | null
          user_type: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          messages?: Json
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
          user_type: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          messages?: Json
          session_id?: string | null
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: []
      }
      hermes_insights: {
        Row: {
          action_url: string | null
          created_at: string
          description: string | null
          dismissed: boolean
          id: string
          priority: string | null
          title: string
          type: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          description?: string | null
          dismissed?: boolean
          id?: string
          priority?: string | null
          title: string
          type: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          description?: string | null
          dismissed?: boolean
          id?: string
          priority?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      housekeeping_checklists: {
        Row: {
          count_expected: number | null
          created_at: string
          id: string
          is_required: boolean
          item_label: string
          room_type_id: string
          sort_order: number
        }
        Insert: {
          count_expected?: number | null
          created_at?: string
          id?: string
          is_required?: boolean
          item_label: string
          room_type_id: string
          sort_order?: number
        }
        Update: {
          count_expected?: number | null
          created_at?: string
          id?: string
          is_required?: boolean
          item_label?: string
          room_type_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_checklists_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      housekeeping_orders: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_by_name: string
          assigned_to: string | null
          cleaning_by_name: string
          cleaning_completed_at: string | null
          cleaning_notes: string
          completed_by_name: string
          created_at: string
          damage_notes: string
          id: string
          inspection_by_name: string
          inspection_completed_at: string | null
          inspection_data: Json | null
          priority: string
          room_type_id: string | null
          status: string
          supplies_used: Json | null
          time_to_complete_minutes: number | null
          unit_name: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_by_name?: string
          assigned_to?: string | null
          cleaning_by_name?: string
          cleaning_completed_at?: string | null
          cleaning_notes?: string
          completed_by_name?: string
          created_at?: string
          damage_notes?: string
          id?: string
          inspection_by_name?: string
          inspection_completed_at?: string | null
          inspection_data?: Json | null
          priority?: string
          room_type_id?: string | null
          status?: string
          supplies_used?: Json | null
          time_to_complete_minutes?: number | null
          unit_name?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_by_name?: string
          assigned_to?: string | null
          cleaning_by_name?: string
          cleaning_completed_at?: string | null
          cleaning_notes?: string
          completed_by_name?: string
          created_at?: string
          damage_notes?: string
          id?: string
          inspection_by_name?: string
          inspection_completed_at?: string | null
          inspection_data?: Json | null
          priority?: string
          room_type_id?: string | null
          status?: string
          supplies_used?: Json | null
          time_to_complete_minutes?: number | null
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_orders_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "housekeeping_orders_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          cost_per_unit: number
          created_at: string
          current_stock: number
          department: string
          id: string
          low_stock_threshold: number
          name: string
          unit: string
        }
        Insert: {
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          department?: string
          id?: string
          low_stock_threshold?: number
          name: string
          unit?: string
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          current_stock?: number
          department?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          unit?: string
        }
        Relationships: []
      }
      interventions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note: string
          vibe_record_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          vibe_record_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          vibe_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interventions_vibe_record_id_fkey"
            columns: ["vibe_record_id"]
            isOneToOne: false
            referencedRelation: "guest_vibe_records"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          change_qty: number
          created_at: string
          department: string
          id: string
          ingredient_id: string
          order_id: string | null
          reason: string
        }
        Insert: {
          change_qty?: number
          created_at?: string
          department?: string
          id?: string
          ingredient_id: string
          order_id?: string | null
          reason?: string
        }
        Update: {
          change_qty?: number
          created_at?: string
          department?: string
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
      invoice_settings: {
        Row: {
          business_hours: string
          created_at: string
          footer_text: string
          id: string
          service_charge_pct: number
          show_payment_method: boolean
          show_service_charge: boolean
          thank_you_message: string
          tin_number: string
          updated_at: string
        }
        Insert: {
          business_hours?: string
          created_at?: string
          footer_text?: string
          id?: string
          service_charge_pct?: number
          show_payment_method?: boolean
          show_service_charge?: boolean
          thank_you_message?: string
          tin_number?: string
          updated_at?: string
        }
        Update: {
          business_hours?: string
          created_at?: string
          footer_text?: string
          id?: string
          service_charge_pct?: number
          show_payment_method?: boolean
          show_service_charge?: boolean
          thank_you_message?: string
          tin_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      it_notes: {
        Row: {
          category: string
          comments: string
          created_at: string
          id: string
          name: string
          updated_at: string
          urls: Json
        }
        Insert: {
          category?: string
          comments?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          urls?: Json
        }
        Update: {
          category?: string
          comments?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          urls?: Json
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          active: boolean
          created_at: string
          department: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          department?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string
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
          department: string
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
          department?: string
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
          department?: string
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
          bar_status: string
          closed_at: string | null
          created_at: string
          guest_name: string
          id: string
          items: Json
          kitchen_status: string
          location_detail: string | null
          order_type: string
          payment_type: string | null
          ready_for_billing: boolean | null
          room_id: string | null
          scheduled_for: string | null
          service_charge: number
          staff_name: string
          status: string
          tab_id: string | null
          tax_details: Json
          total: number
          updated_at: string | null
        }
        Insert: {
          bar_status?: string
          closed_at?: string | null
          created_at?: string
          guest_name?: string
          id?: string
          items?: Json
          kitchen_status?: string
          location_detail?: string | null
          order_type?: string
          payment_type?: string | null
          ready_for_billing?: boolean | null
          room_id?: string | null
          scheduled_for?: string | null
          service_charge?: number
          staff_name?: string
          status?: string
          tab_id?: string | null
          tax_details?: Json
          total?: number
          updated_at?: string | null
        }
        Update: {
          bar_status?: string
          closed_at?: string | null
          created_at?: string
          guest_name?: string
          id?: string
          items?: Json
          kitchen_status?: string
          location_detail?: string | null
          order_type?: string
          payment_type?: string | null
          ready_for_billing?: boolean | null
          room_id?: string | null
          scheduled_for?: string | null
          service_charge?: number
          staff_name?: string
          status?: string
          tab_id?: string | null
          tax_details?: Json
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          requires_approval: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          requires_approval?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          requires_approval?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      payroll_payments: {
        Row: {
          amount: number
          bonus_amount: number
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
          bonus_amount?: number
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
          bonus_amount?: number
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
      payroll_settings: {
        Row: {
          created_at: string
          eom_bonus_amount: number
          id: string
          payday_day_of_week: number
          payday_days_interval: number
          payday_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eom_bonus_amount?: number
          id?: string
          payday_day_of_week?: number
          payday_days_interval?: number
          payday_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eom_bonus_amount?: number
          id?: string
          payday_day_of_week?: number
          payday_days_interval?: number
          payday_type?: string
          updated_at?: string
        }
        Relationships: []
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
      rental_rates: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          item_type: string
          price: number
          rate_name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          item_type?: string
          price?: number
          rate_name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          item_type?: string
          price?: number
          rate_name?: string
          sort_order?: number
        }
        Relationships: []
      }
      request_categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      resort_ops_assets: {
        Row: {
          balance: number
          created_at: string
          id: string
          last_updated: string
          name: string
          type: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          last_updated?: string
          name: string
          type?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          last_updated?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      resort_ops_bookings: {
        Row: {
          addons_total: number
          adults: number
          bill_agreed_at: string | null
          check_in: string
          check_out: string
          checked_in_at: string | null
          checked_out_at: string | null
          children: number
          commission_applied: number
          created_at: string
          external_data: Json | null
          external_reservation_id: string | null
          guest_id: string | null
          guest_login_count: number
          id: string
          last_guest_login: string | null
          last_synced_at: string | null
          notes: string | null
          paid_amount: number
          password_expires_at: string | null
          payment_status: string | null
          platform: string
          room_password: string | null
          room_rate: number
          sirvoy_booking_id: number | null
          source: string | null
          special_requests: string
          unit_id: string | null
        }
        Insert: {
          addons_total?: number
          adults?: number
          bill_agreed_at?: string | null
          check_in: string
          check_out: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          children?: number
          commission_applied?: number
          created_at?: string
          external_data?: Json | null
          external_reservation_id?: string | null
          guest_id?: string | null
          guest_login_count?: number
          id?: string
          last_guest_login?: string | null
          last_synced_at?: string | null
          notes?: string | null
          paid_amount?: number
          password_expires_at?: string | null
          payment_status?: string | null
          platform?: string
          room_password?: string | null
          room_rate?: number
          sirvoy_booking_id?: number | null
          source?: string | null
          special_requests?: string
          unit_id?: string | null
        }
        Update: {
          addons_total?: number
          adults?: number
          bill_agreed_at?: string | null
          check_in?: string
          check_out?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          children?: number
          commission_applied?: number
          created_at?: string
          external_data?: Json | null
          external_reservation_id?: string | null
          guest_id?: string | null
          guest_login_count?: number
          id?: string
          last_guest_login?: string | null
          last_synced_at?: string | null
          notes?: string | null
          paid_amount?: number
          password_expires_at?: string | null
          payment_status?: string | null
          platform?: string
          room_password?: string | null
          room_rate?: number
          sirvoy_booking_id?: number | null
          source?: string | null
          special_requests?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resort_ops_bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resort_ops_bookings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_units"
            referencedColumns: ["id"]
          },
        ]
      }
      resort_ops_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          expense_date: string
          id: string
          image_url: string | null
          invoice_number: string | null
          is_paid: boolean
          name: string
          notes: string | null
          official_receipt_number: string | null
          payment_method: string | null
          project_unit: string | null
          supplier_tin: string | null
          updated_at: string | null
          vat_amount: number
          vat_exempt_amount: number
          vat_status: string
          vatable_sale: number
          withholding_tax: number
          zero_rated_amount: number
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date: string
          id?: string
          image_url?: string | null
          invoice_number?: string | null
          is_paid?: boolean
          name: string
          notes?: string | null
          official_receipt_number?: string | null
          payment_method?: string | null
          project_unit?: string | null
          supplier_tin?: string | null
          updated_at?: string | null
          vat_amount?: number
          vat_exempt_amount?: number
          vat_status?: string
          vatable_sale?: number
          withholding_tax?: number
          zero_rated_amount?: number
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          expense_date?: string
          id?: string
          image_url?: string | null
          invoice_number?: string | null
          is_paid?: boolean
          name?: string
          notes?: string | null
          official_receipt_number?: string | null
          payment_method?: string | null
          project_unit?: string | null
          supplier_tin?: string | null
          updated_at?: string | null
          vat_amount?: number
          vat_exempt_amount?: number
          vat_status?: string
          vatable_sale?: number
          withholding_tax?: number
          zero_rated_amount?: number
        }
        Relationships: []
      }
      resort_ops_guests: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          sirvoy_guest_ref: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          sirvoy_guest_ref?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          sirvoy_guest_ref?: string | null
        }
        Relationships: []
      }
      resort_ops_incoming_payments: {
        Row: {
          amount: number
          created_at: string
          expected_date: string
          id: string
          source: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expected_date: string
          id?: string
          source: string
        }
        Update: {
          amount?: number
          created_at?: string
          expected_date?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      resort_ops_tasks: {
        Row: {
          category: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          priority: string
          status: string
          title: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          priority?: string
          status?: string
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          priority?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      resort_ops_units: {
        Row: {
          base_price: number
          capacity: number
          created_at: string
          id: string
          name: string
          type: string
        }
        Insert: {
          base_price?: number
          capacity?: number
          created_at?: string
          id?: string
          name: string
          type?: string
        }
        Update: {
          base_price?: number
          capacity?: number
          created_at?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
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
      review_settings: {
        Row: {
          active: boolean
          category_name: string
          created_at: string
          id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category_name: string
          created_at?: string
          id?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category_name?: string
          created_at?: string
          id?: string
          sort_order?: number
        }
        Relationships: []
      }
      room_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          guest_name: string | null
          id: string
          notes: string | null
          order_id: string | null
          payment_method: string
          service_charge_amount: number
          staff_name: string
          tax_amount: number
          total_amount: number
          transaction_type: string
          unit_id: string | null
          unit_name: string
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_method?: string
          service_charge_amount?: number
          staff_name?: string
          tax_amount?: number
          total_amount?: number
          transaction_type?: string
          unit_id?: string | null
          unit_name?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          guest_name?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_method?: string
          service_charge_amount?: number
          staff_name?: string
          tax_amount?: number
          total_amount?: number
          transaction_type?: string
          unit_id?: string | null
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_transactions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          base_rate: number
          created_at: string
          id: string
          name: string
        }
        Insert: {
          base_rate?: number
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          base_rate?: number
          created_at?: string
          id?: string
          name?: string
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
      staff_roles: {
        Row: {
          created_at: string
          id: string
          name: string
          permissions: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          permissions?: string[]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          permissions?: string[]
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
      task_comments: {
        Row: {
          author_name: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          link_url: string | null
          task_id: string
        }
        Insert: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          link_url?: string | null
          task_id: string
        }
        Update: {
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          link_url?: string | null
          task_id?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          employee_id: string
          entry_date: string
          id: string
          is_paid: boolean
          paid_amount: number | null
          paid_at: string | null
          updated_at: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          employee_id: string
          entry_date?: string
          id?: string
          is_paid?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          updated_at?: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          employee_id?: string
          entry_date?: string
          id?: string
          is_paid?: boolean
          paid_amount?: number | null
          paid_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_bookings: {
        Row: {
          booking_id: string | null
          captain_confirmed: boolean | null
          confirmed_by: string
          created_at: string
          guest_name: string
          guide_confirmed: boolean | null
          id: string
          notes: string
          pax: number
          pickup_time: string
          price: number
          room_id: string | null
          status: string
          tour_date: string
          tour_name: string
        }
        Insert: {
          booking_id?: string | null
          captain_confirmed?: boolean | null
          confirmed_by?: string
          created_at?: string
          guest_name?: string
          guide_confirmed?: boolean | null
          id?: string
          notes?: string
          pax?: number
          pickup_time?: string
          price?: number
          room_id?: string | null
          status?: string
          tour_date?: string
          tour_name?: string
        }
        Update: {
          booking_id?: string | null
          captain_confirmed?: boolean | null
          confirmed_by?: string
          created_at?: string
          guest_name?: string
          guide_confirmed?: boolean | null
          id?: string
          notes?: string
          pax?: number
          pickup_time?: string
          price?: number
          room_id?: string | null
          status?: string
          tour_date?: string
          tour_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_bookings_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "resort_ops_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      tours_config: {
        Row: {
          active: boolean
          created_at: string
          description: string
          duration: string
          id: string
          max_pax: number
          name: string
          price: number
          schedule: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          duration?: string
          id?: string
          max_pax?: number
          name: string
          price?: number
          schedule?: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          duration?: string
          id?: string
          max_pax?: number
          name?: string
          price?: number
          schedule?: string
          sort_order?: number
        }
        Relationships: []
      }
      transport_rates: {
        Row: {
          active: boolean
          created_at: string
          description: string
          destination: string
          id: string
          origin: string
          price: number
          sort_order: number
          type: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string
          destination?: string
          id?: string
          origin?: string
          price?: number
          sort_order?: number
          type: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          destination?: string
          id?: string
          origin?: string
          price?: number
          sort_order?: number
          type?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          room_type_id: string | null
          status: string
          unit_name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          room_type_id?: string | null
          status?: string
          unit_name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          room_type_id?: string | null
          status?: string
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      vibe_updates: {
        Row: {
          created_at: string
          id: string
          notes: string
          updated_by: string
          updated_fields: Json
          vibe_record_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string
          updated_by?: string
          updated_fields?: Json
          vibe_record_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          updated_by?: string
          updated_fields?: Json
          vibe_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vibe_updates_vibe_record_id_fkey"
            columns: ["vibe_record_id"]
            isOneToOne: false
            referencedRelation: "guest_vibe_records"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          retry_count: number
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          source?: string
          status?: string
        }
        Relationships: []
      }
      weekly_schedules: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          schedule_date: string
          time_in: string
          time_out: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          schedule_date: string
          time_in: string
          time_out: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          schedule_date?: string
          time_in?: string
          time_out?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_schedules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bytea_to_text: { Args: { data: string }; Returns: string }
      decrement_stock: {
        Args: { p_amount: number; p_ingredient_id: string }
        Returns: undefined
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
