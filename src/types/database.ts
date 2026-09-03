// Generated from the database schema. Prefer regenerating over editing.
//
// ---------------------------------------------------------------------------
// Where it comes from and what keeps it honest
// ---------------------------------------------------------------------------
//
// `supabase gen types` needs Docker even with --db-url (it runs pg-meta in a
// container), and there is none here, so this was generated from the live
// project. That is only sound because the project provably matches the
// migrations: the table, column, type, nullability and enum structure of both
// sides hashes to 5e9d7170e19a3a4a094493bd32a2f539.
//
// A generated file nothing verifies is the reason this did not exist sooner.
// `npm run qa:types` builds the schema from supabase/migrations and compares
// it against what this file declares — every table, every column, its type
// and nullability, every enum's values in order, and the name of every
// function. It needs no Docker and no credentials, so it runs in CI on every
// push. Change a migration without updating this file and that check fails and
// names the difference.
//
// ---------------------------------------------------------------------------
// The part that is maintained by hand
// ---------------------------------------------------------------------------
//
// Function signatures. Without Docker there is no way to regenerate this file
// from a migration that has not been applied to the live project yet, so a
// migration adding a function is followed by an `Args`/`Returns` entry written
// here by hand — 0028's three wishlist functions are the current example.
//
// qa:types checks that the names line up, which catches a function added to a
// migration and forgotten here. It does not check the signatures: deciding what
// `Args` a given SQL signature maps to would mean reimplementing the generator,
// and a second generator with its own bugs is exactly what this file exists to
// avoid. A hand-written signature is therefore only as good as the call site
// that exercises it — which, since every one of these is called from typed
// code, is a real check, just not an automatic one.
//
// To regenerate: `supabase gen types typescript --project-id <id>`, or with
// Docker available `--db-url postgresql://…/garmentvibes_schema_check` after
// `node scripts/qa/schema.mjs` has built it. Without either, qa:types tells
// you exactly which lines to change.

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
      cart_items: {
        Row: {
          color: string
          created_at: string
          id: string
          product_id: string
          qty: number
          size_label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          product_id: string
          qty: number
          size_label: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          size_label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_invoices: {
        Row: {
          account_id: string
          amount: number
          business_name: string
          contact_name: string
          created_at: string
          due_on: string
          email: string
          id: string
          issued_on: string
          quote_id: string | null
          reference: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          business_name: string
          contact_name: string
          created_at?: string
          due_on: string
          email: string
          id?: string
          issued_on?: string
          quote_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          business_name?: string
          contact_name?: string
          created_at?: string
          due_on?: string
          email?: string
          id?: string
          issued_on?: string
          quote_id?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "wholesale_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["credit_payment_method"]
          received_on: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["credit_payment_method"]
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["credit_payment_method"]
          received_on?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_invoice_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          claimed_at: string | null
          created_at: string
          dedupe_key: string | null
          failure_reason: string | null
          id: string
          next_attempt_at: string | null
          recipient: string
          recipient_name: string
          related_to: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          subject: string
          template: Database["public"]["Enums"]["notification_template"]
        }
        Insert: {
          attempts?: number
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          failure_reason?: string | null
          id?: string
          next_attempt_at?: string | null
          recipient: string
          recipient_name: string
          related_to?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string
          template: Database["public"]["Enums"]["notification_template"]
        }
        Update: {
          attempts?: number
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          failure_reason?: string | null
          id?: string
          next_attempt_at?: string | null
          recipient?: string
          recipient_name?: string
          related_to?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string
          template?: Database["public"]["Enums"]["notification_template"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          full_name: string
          gstin: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          wholesale_account_id: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          full_name: string
          gstin?: string | null
          id: string
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          wholesale_account_id?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          gstin?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          wholesale_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_wholesale_account_id_fkey"
            columns: ["wholesale_account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          active: boolean
          built_in: boolean
          code: string
          created_at: string
          expires_on: string | null
          issued_to: string | null
          max_per_customer: number | null
          max_redemptions: number | null
          percent: number
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          built_in?: boolean
          code: string
          created_at?: string
          expires_on?: string | null
          issued_to?: string | null
          max_per_customer?: number | null
          max_redemptions?: number | null
          percent: number
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          built_in?: boolean
          code?: string
          created_at?: string
          expires_on?: string | null
          issued_to?: string | null
          max_per_customer?: number | null
          max_redemptions?: number | null
          percent?: number
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          code: string
          created_at: string
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "promo_code_usage"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_redemptions_code_fkey"
            columns: ["code"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "promo_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "retail_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_addresses: {
        Row: {
          address_line1: string
          city: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string
          phone: string
          pincode: string
          state: string
          user_id: string
        }
        Insert: {
          address_line1: string
          city: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          label: string
          phone: string
          pincode: string
          state: string
          user_id: string
        }
        Update: {
          address_line1?: string
          city?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string
          pincode?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      retail_order_items: {
        Row: {
          color: string
          hsn_code: string | null
          id: string
          order_id: string
          price: number
          product_id: string
          product_name: string | null
          qty: number
          size: string
          tax_amount: number
          tax_rate: number
          taxable_value: number
        }
        Insert: {
          color: string
          hsn_code?: string | null
          id?: string
          order_id: string
          price: number
          product_id: string
          product_name?: string | null
          qty: number
          size: string
          tax_amount?: number
          tax_rate?: number
          taxable_value?: number
        }
        Update: {
          color?: string
          hsn_code?: string | null
          id?: string
          order_id?: string
          price?: number
          product_id?: string
          product_name?: string | null
          qty?: number
          size?: string
          tax_amount?: number
          tax_rate?: number
          taxable_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "retail_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "retail_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_orders: {
        Row: {
          awb: string | null
          cancelled_at: string | null
          cod_fee: number
          courier_id: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          delivered_at: string | null
          discount: number
          id: string
          invoice_number: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          phone: string | null
          place_of_supply: string | null
          promo_code: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          reference: string | null
          seller_gstin: string | null
          shipped_at: string | null
          shipping_address: Json
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_cgst: number
          tax_igst: number
          tax_sgst: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          awb?: string | null
          cancelled_at?: string | null
          cod_fee?: number
          courier_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          discount?: number
          id?: string
          invoice_number?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone?: string | null
          place_of_supply?: string | null
          promo_code?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference?: string | null
          seller_gstin?: string | null
          shipped_at?: string | null
          shipping_address: Json
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_cgst?: number
          tax_igst?: number
          tax_sgst?: number
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          awb?: string | null
          cancelled_at?: string | null
          cod_fee?: number
          courier_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          discount?: number
          id?: string
          invoice_number?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          phone?: string | null
          place_of_supply?: string | null
          promo_code?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          reference?: string | null
          seller_gstin?: string | null
          shipped_at?: string | null
          shipping_address?: Json
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_cgst?: number
          tax_igst?: number
          tax_sgst?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      retail_product_sizes: {
        Row: {
          id: string
          in_stock: boolean | null
          label: string
          product_id: string
          sort_order: number
          stock_qty: number
        }
        Insert: {
          id?: string
          in_stock?: boolean | null
          label: string
          product_id: string
          sort_order?: number
          stock_qty?: number
        }
        Update: {
          id?: string
          in_stock?: boolean | null
          label?: string
          product_id?: string
          sort_order?: number
          stock_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "retail_product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_products: {
        Row: {
          brand: string
          category: Database["public"]["Enums"]["retail_category"]
          colors: string[]
          created_at: string
          currency: string
          description: string
          id: string
          images: string[]
          is_active: boolean
          mrp: number
          name: string
          price: number
          rating: number
          rating_count: number
          slug: string
          subcategory: string
          tags: Database["public"]["Enums"]["retail_tag"][]
        }
        Insert: {
          brand: string
          category: Database["public"]["Enums"]["retail_category"]
          colors?: string[]
          created_at?: string
          currency?: string
          description?: string
          id?: string
          images?: string[]
          is_active?: boolean
          mrp: number
          name: string
          price: number
          rating?: number
          rating_count?: number
          slug: string
          subcategory: string
          tags?: Database["public"]["Enums"]["retail_tag"][]
        }
        Update: {
          brand?: string
          category?: Database["public"]["Enums"]["retail_category"]
          colors?: string[]
          created_at?: string
          currency?: string
          description?: string
          id?: string
          images?: string[]
          is_active?: boolean
          mrp?: number
          name?: string
          price?: number
          rating?: number
          rating_count?: number
          slug?: string
          subcategory?: string
          tags?: Database["public"]["Enums"]["retail_tag"][]
        }
        Relationships: []
      }
      return_items: {
        Row: {
          color: string
          exchange_for_price: number | null
          exchange_for_product_id: string | null
          exchange_for_size: string | null
          id: string
          price: number
          product_id: string
          product_name: string
          qty: number
          return_id: string
          size_label: string
        }
        Insert: {
          color: string
          exchange_for_price?: number | null
          exchange_for_product_id?: string | null
          exchange_for_size?: string | null
          id?: string
          price: number
          product_id: string
          product_name: string
          qty: number
          return_id: string
          size_label: string
        }
        Update: {
          color?: string
          exchange_for_price?: number | null
          exchange_for_product_id?: string | null
          exchange_for_size?: string | null
          id?: string
          price?: number
          product_id?: string
          product_name?: string
          qty?: number
          return_id?: string
          size_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_exchange_for_product_id_fkey"
            columns: ["exchange_for_product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          comments: string | null
          created_at: string
          customer_email: string
          customer_name: string
          decision_note: string | null
          exchange_balance: number
          id: string
          order_id: string
          phone: string
          reason: Database["public"]["Enums"]["return_reason"]
          reference: string | null
          refund_amount: number
          resolution: Database["public"]["Enums"]["return_resolution"]
          restocked_at: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          decision_note?: string | null
          exchange_balance?: number
          id?: string
          order_id: string
          phone: string
          reason: Database["public"]["Enums"]["return_reason"]
          reference?: string | null
          refund_amount?: number
          resolution: Database["public"]["Enums"]["return_resolution"]
          restocked_at?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          decision_note?: string | null
          exchange_balance?: number
          id?: string
          order_id?: string
          phone?: string
          reason?: Database["public"]["Enums"]["return_reason"]
          reference?: string | null
          refund_amount?: number
          resolution?: Database["public"]["Enums"]["return_resolution"]
          restocked_at?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "retail_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author: string
          body: string
          created_at: string
          id: string
          order_id: string | null
          product_id: string
          rating: number
          status: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author: string
          body?: string
          created_at?: string
          id?: string
          order_id?: string | null
          product_id: string
          rating: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "retail_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          notified_at: string | null
          product_id: string
          size_label: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          notified_at?: string | null
          product_id: string
          size_label: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          notified_at?: string | null
          product_id?: string
          size_label?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_account_members: {
        Row: {
          accepted_at: string | null
          account_id: string
          email: string
          id: string
          invited_at: string
          name: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["membership_status"]
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          account_id: string
          email: string
          id?: string
          invited_at?: string
          name: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          account_id?: string
          email?: string
          id?: string
          invited_at?: string
          name?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_account_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_accounts: {
        Row: {
          approved_at: string | null
          business_name: string
          contact_name: string
          credit_days: number
          credit_limit: number | null
          credit_terms_requested: boolean
          decision_note: string | null
          email: string
          gstin: string | null
          id: string
          payment_terms: Database["public"]["Enums"]["payment_terms"]
          phone: string | null
          registered_at: string
          status: Database["public"]["Enums"]["wholesale_approval_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          business_name: string
          contact_name: string
          credit_days?: number
          credit_limit?: number | null
          credit_terms_requested?: boolean
          decision_note?: string | null
          email: string
          gstin?: string | null
          id?: string
          payment_terms?: Database["public"]["Enums"]["payment_terms"]
          phone?: string | null
          registered_at?: string
          status?: Database["public"]["Enums"]["wholesale_approval_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          business_name?: string
          contact_name?: string
          credit_days?: number
          credit_limit?: number | null
          credit_terms_requested?: boolean
          decision_note?: string | null
          email?: string
          gstin?: string | null
          id?: string
          payment_terms?: Database["public"]["Enums"]["payment_terms"]
          phone?: string | null
          registered_at?: string
          status?: Database["public"]["Enums"]["wholesale_approval_status"]
          updated_at?: string
        }
        Relationships: []
      }
      wholesale_claim_lines: {
        Row: {
          approved_qty: number | null
          billed_qty: number
          claim_id: string
          claimed_qty: number
          id: string
          price_per_unit: number
          product_name: string
          sku: string
        }
        Insert: {
          approved_qty?: number | null
          billed_qty: number
          claim_id: string
          claimed_qty: number
          id?: string
          price_per_unit: number
          product_name: string
          sku: string
        }
        Update: {
          approved_qty?: number | null
          billed_qty?: number
          claim_id?: string
          claimed_qty?: number
          id?: string
          price_per_unit?: number
          product_name?: string
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_claim_lines_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "wholesale_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_claims: {
        Row: {
          account_id: string | null
          business_name: string
          comments: string | null
          contact_name: string
          created_at: string
          decision_note: string | null
          email: string
          id: string
          quote_id: string
          reason: Database["public"]["Enums"]["claim_reason"]
          reference: string | null
          requested_resolution: Database["public"]["Enums"]["claim_resolution"]
          settled_amount: number | null
          settled_at: string | null
          settled_resolution:
            | Database["public"]["Enums"]["claim_resolution"]
            | null
          status: Database["public"]["Enums"]["claim_status"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          business_name: string
          comments?: string | null
          contact_name: string
          created_at?: string
          decision_note?: string | null
          email: string
          id?: string
          quote_id: string
          reason: Database["public"]["Enums"]["claim_reason"]
          reference?: string | null
          requested_resolution: Database["public"]["Enums"]["claim_resolution"]
          settled_amount?: number | null
          settled_at?: string | null
          settled_resolution?:
            | Database["public"]["Enums"]["claim_resolution"]
            | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          business_name?: string
          comments?: string | null
          contact_name?: string
          created_at?: string
          decision_note?: string | null
          email?: string
          id?: string
          quote_id?: string
          reason?: Database["public"]["Enums"]["claim_reason"]
          reference?: string | null
          requested_resolution?: Database["public"]["Enums"]["claim_resolution"]
          settled_amount?: number | null
          settled_at?: string | null
          settled_resolution?:
            | Database["public"]["Enums"]["claim_resolution"]
            | null
          status?: Database["public"]["Enums"]["claim_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_claims_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_claims_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "wholesale_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_price_tiers: {
        Row: {
          id: string
          min_qty: number
          price_per_unit: number
          product_id: string
        }
        Insert: {
          id?: string
          min_qty: number
          price_per_unit: number
          product_id: string
        }
        Update: {
          id?: string
          min_qty?: number
          price_per_unit?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wholesale_products"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_products: {
        Row: {
          category: Database["public"]["Enums"]["wholesale_category"]
          colors: string[]
          created_at: string
          currency: string
          description: string
          fabric: string
          id: string
          images: string[]
          is_active: boolean
          lead_time_days: number
          moq: number
          name: string
          pack_size: number
          size_run: string
          sku: string
          slug: string
          subcategory: string
          tags: Database["public"]["Enums"]["wholesale_tag"][]
        }
        Insert: {
          category: Database["public"]["Enums"]["wholesale_category"]
          colors?: string[]
          created_at?: string
          currency?: string
          description?: string
          fabric?: string
          id?: string
          images?: string[]
          is_active?: boolean
          lead_time_days?: number
          moq: number
          name: string
          pack_size: number
          size_run?: string
          sku: string
          slug: string
          subcategory: string
          tags?: Database["public"]["Enums"]["wholesale_tag"][]
        }
        Update: {
          category?: Database["public"]["Enums"]["wholesale_category"]
          colors?: string[]
          created_at?: string
          currency?: string
          description?: string
          fabric?: string
          id?: string
          images?: string[]
          is_active?: boolean
          lead_time_days?: number
          moq?: number
          name?: string
          pack_size?: number
          size_run?: string
          sku?: string
          slug?: string
          subcategory?: string
          tags?: Database["public"]["Enums"]["wholesale_tag"][]
        }
        Relationships: []
      }
      wholesale_quote_items: {
        Row: {
          hsn_code: string | null
          id: string
          price_per_unit: number
          product_id: string
          product_name: string | null
          qty: number
          quote_id: string
          sku: string | null
          tax_amount: number
          tax_rate: number
          taxable_value: number
        }
        Insert: {
          hsn_code?: string | null
          id?: string
          price_per_unit: number
          product_id: string
          product_name?: string | null
          qty: number
          quote_id: string
          sku?: string | null
          tax_amount?: number
          tax_rate?: number
          taxable_value?: number
        }
        Update: {
          hsn_code?: string | null
          id?: string
          price_per_unit?: number
          product_id?: string
          product_name?: string | null
          qty?: number
          quote_id?: string
          sku?: string | null
          tax_amount?: number
          tax_rate?: number
          taxable_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "wholesale_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wholesale_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "wholesale_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_quotes: {
        Row: {
          account_id: string | null
          awb: string | null
          business_name: string | null
          buyer_gstin: string | null
          contact_name: string | null
          courier_id: string | null
          created_at: string
          currency: string
          delivered_at: string | null
          email: string | null
          grand_total: number
          id: string
          invoice_number: string | null
          kind: Database["public"]["Enums"]["wholesale_record_kind"]
          place_of_supply: string | null
          reference: string | null
          seller_gstin: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_cgst: number
          tax_igst: number
          tax_sgst: number
          total_estimate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          awb?: string | null
          business_name?: string | null
          buyer_gstin?: string | null
          contact_name?: string | null
          courier_id?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          email?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          kind?: Database["public"]["Enums"]["wholesale_record_kind"]
          place_of_supply?: string | null
          reference?: string | null
          seller_gstin?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_cgst?: number
          tax_igst?: number
          tax_sgst?: number
          total_estimate: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          awb?: string | null
          business_name?: string | null
          buyer_gstin?: string | null
          contact_name?: string | null
          courier_id?: string | null
          created_at?: string
          currency?: string
          delivered_at?: string | null
          email?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          kind?: Database["public"]["Enums"]["wholesale_record_kind"]
          place_of_supply?: string | null
          reference?: string | null
          seller_gstin?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_cgst?: number
          tax_igst?: number
          tax_sgst?: number
          total_estimate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_ship_to_addresses: {
        Row: {
          account_id: string
          address_line1: string
          city: string
          contact_name: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          phone: string
          pincode: string
          state: string
        }
        Insert: {
          account_id: string
          address_line1: string
          city: string
          contact_name: string
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          phone: string
          pincode: string
          state: string
        }
        Update: {
          account_id?: string
          address_line1?: string
          city?: string
          contact_name?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string
          pincode?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_ship_to_addresses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          created_at: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "retail_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      credit_invoice_balances: {
        Row: {
          account_id: string | null
          amount: number | null
          amount_outstanding: number | null
          amount_paid: number | null
          business_name: string | null
          days_overdue: number | null
          due_on: string | null
          id: string | null
          issued_on: string | null
          reference: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_invoices_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "wholesale_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage: {
        Row: {
          code: string | null
          customers: number | null
          redemptions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      active_product_id: { Args: { p_slug: string }; Returns: string }
      adjust_retail_stock: {
        Args: { p_delta: number; p_size: string; p_slug: string }
        Returns: number
      }
      cart_add: {
        Args: {
          p_color: string
          p_qty?: number
          p_size: string
          p_slug: string
        }
        Returns: number
      }
      cart_clear: { Args: never; Returns: number }
      cart_merge: { Args: { p_lines: Json }; Returns: number }
      cart_set_qty: {
        Args: { p_color: string; p_qty: number; p_size: string; p_slug: string }
        Returns: number
      }
      claim_stock_alerts: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          email: string
          id: string
          name: string
          notified_at: string | null
          product_id: string
          size_label: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "stock_alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notifications: {
        Args: { p_limit?: number; p_stale_after?: string }
        Returns: {
          attempts: number
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          claimed_at: string | null
          created_at: string
          dedupe_key: string | null
          failure_reason: string | null
          id: string
          next_attempt_at: string | null
          recipient: string
          recipient_name: string
          related_to: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          subject: string
          template: Database["public"]["Enums"]["notification_template"]
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      erase_my_account: { Args: never; Returns: Json }
      evaluate_promo: { Args: { p_code: string }; Returns: Json }
      mark_notification_failed: {
        Args: { p_id: string; p_reason: string }
        Returns: boolean
      }
      mark_notification_sent: { Args: { p_id: string }; Returns: boolean }
      mark_retail_order_paid: {
        Args: { p_amount: number; p_payment_id: string; p_reference: string }
        Returns: string
      }
      place_retail_order: {
        Args: {
          p_address: Json
          p_cod_fee: number
          p_customer_email: string
          p_customer_name: string
          p_discount: number
          p_items: Json
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_phone: string
          p_place_of_supply: string
          p_promo_code: string
          p_reference: string
          p_seller_gstin: string
          p_subtotal: number
          p_tax_cgst: number
          p_tax_igst: number
          p_tax_sgst: number
          p_total: number
        }
        Returns: string
      }
      release_retail_order: { Args: { p_order_id: string }; Returns: boolean }
      require_caller: { Args: never; Returns: string }
      stock_alert_subscribe: {
        Args: { p_email: string; p_name: string; p_size: string; p_slug: string }
        Returns: boolean
      }
      wishlist_add: { Args: { p_slug: string }; Returns: boolean }
      wishlist_merge: { Args: { p_slugs: string[] }; Returns: number }
      wishlist_remove: { Args: { p_slug: string }; Returns: boolean }
    }
    Enums: {
      claim_reason:
        | "short_shipment"
        | "damaged_in_transit"
        | "wrong_item_shipped"
        | "quality_below_sample"
      claim_resolution: "credit_note" | "replacement"
      claim_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "settled"
      credit_payment_method: "bank_transfer" | "cheque" | "upi" | "adjustment"
      invoice_status: "open" | "part_paid" | "paid" | "written_off"
      membership_status: "invited" | "active" | "revoked"
      notification_channel: "email" | "sms" | "whatsapp"
      notification_status: "queued" | "sent" | "failed"
      notification_template:
        | "order_placed"
        | "order_shipped"
        | "order_delivered"
        | "order_cancelled"
        | "return_requested"
        | "return_approved"
        | "return_rejected"
        | "exchange_shipped"
        | "back_in_stock"
        | "cart_reminder"
        | "question_answered"
        | "support_reply"
        | "refund_initiated"
        | "wholesale_account_approved"
        | "wholesale_account_rejected"
        | "quote_ready"
        | "bulk_order_shipped"
        | "claim_received"
        | "claim_resolved"
        | "credit_terms_approved"
        | "payment_overdue"
      order_status:
        | "pending"
        | "confirmed"
        | "packed"
        | "shipped"
        | "delivered"
        | "cancelled"
      payment_method:
        | "online"
        | "upi"
        | "card"
        | "netbanking"
        | "wallet"
        | "emi"
        | "cod"
      payment_terms: "prepay" | "net30"
      quote_status:
        | "requested"
        | "quoted"
        | "confirmed"
        | "in_production"
        | "shipped"
        | "rejected"
        | "fulfilled"
      retail_category: "women" | "men" | "kids"
      retail_tag: "new" | "bestseller" | "sale"
      return_reason:
        | "size_or_fit"
        | "damaged_or_defective"
        | "wrong_item"
        | "not_as_described"
        | "quality_below_expectation"
        | "changed_mind"
      return_resolution: "refund" | "exchange"
      return_status:
        | "requested"
        | "approved"
        | "rejected"
        | "picked_up"
        | "refunded"
        | "exchange_shipped"
      review_status: "pending" | "published" | "rejected"
      team_role: "admin" | "purchaser" | "viewer"
      user_role: "retail" | "wholesale" | "admin"
      wholesale_approval_status: "pending" | "approved" | "rejected"
      wholesale_category: "women" | "men" | "kids" | "unisex" | "fabric"
      wholesale_record_kind: "quote" | "order"
      wholesale_tag: "new" | "bestseller" | "closeout"
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
      claim_reason: [
        "short_shipment",
        "damaged_in_transit",
        "wrong_item_shipped",
        "quality_below_sample",
      ],
      claim_resolution: ["credit_note", "replacement"],
      claim_status: [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "settled",
      ],
      credit_payment_method: ["bank_transfer", "cheque", "upi", "adjustment"],
      invoice_status: ["open", "part_paid", "paid", "written_off"],
      membership_status: ["invited", "active", "revoked"],
      notification_channel: ["email", "sms", "whatsapp"],
      notification_status: ["queued", "sent", "failed"],
      notification_template: [
        "order_placed",
        "order_shipped",
        "order_delivered",
        "order_cancelled",
        "return_requested",
        "return_approved",
        "return_rejected",
        "exchange_shipped",
        "back_in_stock",
        "cart_reminder",
        "question_answered",
        "support_reply",
        "refund_initiated",
        "wholesale_account_approved",
        "wholesale_account_rejected",
        "quote_ready",
        "bulk_order_shipped",
        "claim_received",
        "claim_resolved",
        "credit_terms_approved",
        "payment_overdue",
      ],
      order_status: [
        "pending",
        "confirmed",
        "packed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      payment_method: [
        "online",
        "upi",
        "card",
        "netbanking",
        "wallet",
        "emi",
        "cod",
      ],
      payment_terms: ["prepay", "net30"],
      quote_status: [
        "requested",
        "quoted",
        "confirmed",
        "in_production",
        "shipped",
        "rejected",
        "fulfilled",
      ],
      retail_category: ["women", "men", "kids"],
      retail_tag: ["new", "bestseller", "sale"],
      return_reason: [
        "size_or_fit",
        "damaged_or_defective",
        "wrong_item",
        "not_as_described",
        "quality_below_expectation",
        "changed_mind",
      ],
      return_resolution: ["refund", "exchange"],
      return_status: [
        "requested",
        "approved",
        "rejected",
        "picked_up",
        "refunded",
        "exchange_shipped",
      ],
      review_status: ["pending", "published", "rejected"],
      team_role: ["admin", "purchaser", "viewer"],
      user_role: ["retail", "wholesale", "admin"],
      wholesale_approval_status: ["pending", "approved", "rejected"],
      wholesale_category: ["women", "men", "kids", "unisex", "fabric"],
      wholesale_record_kind: ["quote", "order"],
      wholesale_tag: ["new", "bestseller", "closeout"],
    },
  },
} as const
