-- Essay Structurer App - Supabase Database Setup
-- Run this script in your Supabase SQL Editor

-- 1. Create the storage bucket for audio-recordings (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-recordings', 
  'audio-recordings', 
  true, 
  52428800, -- 50MB limit
  ARRAY['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mp4', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up storage policies for the audio-recordings bucket
-- Allow public read access to audio-recordings
CREATE POLICY "Public read access for audio-recordings"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audio-recordings');

-- Allow authenticated users to upload audio-recordings
CREATE POLICY "Authenticated users can upload audio-recordings"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'audio-recordings');

-- Allow authenticated users to update their audio-recordings
CREATE POLICY "Authenticated users can update audio-recordings"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'audio-recordings');

-- Allow authenticated users to delete their audio-recordings
CREATE POLICY "Authenticated users can delete audio-recordings"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'audio-recordings');

-- 3. Optional: Create a table to track essay sessions (for future features)
CREATE TABLE IF NOT EXISTS public.essay_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  audio_url TEXT,
  transcript TEXT,
  outline TEXT,
  tts_url TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 4. Set up Row Level Security (RLS) for essay_sessions table
ALTER TABLE public.essay_sessions ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own sessions
CREATE POLICY "Users can read their own sessions"
ON public.essay_sessions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to insert their own sessions
CREATE POLICY "Users can insert their own sessions"
ON public.essay_sessions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own sessions
CREATE POLICY "Users can update their own sessions"
ON public.essay_sessions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to delete their own sessions
CREATE POLICY "Users can delete their own sessions"
ON public.essay_sessions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 5. Create an updated_at trigger for the essay_sessions table
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handle_essay_sessions_updated_at ON public.essay_sessions;
CREATE TRIGGER handle_essay_sessions_updated_at
  BEFORE UPDATE ON public.essay_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 6. Optional: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_essay_sessions_user_id ON public.essay_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_created_at ON public.essay_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_status ON public.essay_sessions(status);

-- 7. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON public.essay_sessions TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Essay Structurer database setup completed successfully!';
  RAISE NOTICE 'Storage bucket "audio-recordings" is ready for audio files.';
  RAISE NOTICE 'Table "essay_sessions" is ready for session tracking.';
END $$;
