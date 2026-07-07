CREATE TABLE public.task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  author_name text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  image_url text,
  link_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read task_comments" ON public.task_comments FOR SELECT USING (true);
CREATE POLICY "Public insert task_comments" ON public.task_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete task_comments" ON public.task_comments FOR DELETE USING (true);
CREATE POLICY "Public update task_comments" ON public.task_comments FOR UPDATE USING (true) WITH CHECK (true);