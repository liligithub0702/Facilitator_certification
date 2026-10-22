-- The facilitator moves from the live session to the coaching form with a button, whenever
-- they're ready; it no longer waits for the session time the certifier set.

create or replace function public.advance_phase(p_submission uuid) returns public.module_submissions
language plpgsql security definer set search_path = '' as $$
declare
  s public.module_submissions;
begin
  if not public.owns_submission(p_submission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  s := public.sync_submission(p_submission);

  if s.module = 1 and s.phase = 'coaching' and s.status in ('submitted', 'graded') then
    update public.module_submissions
       set phase = 'documentation',
           phase_deadline = now() + make_interval(secs => public.setting_int(array['timers', 'm1_doc_sec'], 600))
     where id = s.id returning * into s;
    return s;
  end if;

  if s.status <> 'in_progress' then
    return s;
  end if;
  if s.module = 1 and s.phase = 'dashboard' then
    update public.module_submissions
       set phase = 'readout',
           phase_deadline = now() + make_interval(secs => public.setting_int(array['timers', 'm1_readout_sec'], 600))
     where id = s.id returning * into s;
  elsif s.module = 2 and s.phase = 'watching' then
    update public.module_submissions
       set phase = 'debrief',
           phase_deadline = now() + make_interval(secs => public.setting_int(array['timers', 'm2_debrief_sec'], 1500))
     where id = s.id returning * into s;
  end if;
  return s;
end $$;

