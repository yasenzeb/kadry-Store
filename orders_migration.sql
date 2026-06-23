-- Migration: create orders table
-- Run this in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.orders (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text        NOT NULL UNIQUE,
  customer_name     text        NOT NULL,
  customer_phone    text        NOT NULL,
  governorate       text        NOT NULL,
  address           text        NOT NULL,
  notes             text,
  payment_method    text        NOT NULL CHECK (payment_method IN ('cod','transfer')),
  items             jsonb       NOT NULL DEFAULT '[]',
  subtotal          numeric     NOT NULL DEFAULT 0,
  shipping_cost     numeric     NOT NULL DEFAULT 0,
  total             numeric     NOT NULL DEFAULT 0,
  payment_proof_url text,
  status            text        NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security (all writes happen server-side via service_role, so no public policy needed)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Only service_role can access orders (no public policy)
-- No INSERT/SELECT/UPDATE/DELETE policy for the public role means public access is denied.
