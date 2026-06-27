-- Migration 0019: Make the queue_number uniqueness deferrable
-- The renumber and set-queue-number functions (0015) reassign multiple rows in
-- one transaction. With a plain unique index, Postgres checks uniqueness per row
-- mid-statement and fails on transient duplicates, so renumber/swap never apply.
-- Converting to a DEFERRABLE INITIALLY DEFERRED unique constraint defers the
-- check to commit time, allowing the intermediate states while still enforcing
-- uniqueness overall. This fixes 0015 without changing its functions.

DROP INDEX IF EXISTS public.registrations_queue_number_key;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_queue_number_key
  UNIQUE (queue_number) DEFERRABLE INITIALLY DEFERRED;
