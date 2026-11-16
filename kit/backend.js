// Shared Supabase connection for every client invite.
// The anon key is public by design (row-level security protects the data).
window.INVITE_BACKEND = { supabaseUrl: "https://vnkwdfbwplgkcjgvvixp.supabase.co", supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZua3dkZmJ3cGxna2NqZ3Z2aXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTQ3NDcsImV4cCI6MjEwNTU5MDc0N30.ochfjmYWe2bKmjogfmW7WPTGGxWwrgYZN9KW-5Sff4k" };
