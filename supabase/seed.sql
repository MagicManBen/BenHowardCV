-- ============================================================
-- SEED DATA: Insert the Ally Consultants sample application
-- ============================================================
-- Run this AFTER creating the table.
-- User UUID: 17900fce-9056-4b49-a666-41a30f4f3f24

insert into public.applications (
  user_id,
  ref,
  company_name,
  role_title,
  location,
  sector,
  salary,
  employment_type,
  short_company_reason,
  short_role_reason,
  tone_keywords,
  probable_priorities,
  advert_summary,
  personalised_intro,
  why_this_role,
  key_focus_areas,
  raw_job_advert,
  is_published
) values (
  '17900fce-9056-4b49-a666-41a30f4f3f24',
  'ally-consultants-general-manager-stoke-on-trent',
  'Ally Consultants Ltd',
  'General Manager',
  'Stoke-on-Trent',
  'hospitality',
  'From £50,000 a year',
  'Full-time',
  'Join a vibrant new destination in Stoke-on-Trent.',
  'Lead a dynamic venue with full operational control.',
  ARRAY['hands-on', 'dynamic', 'fast-paced', 'leadership', 'commercial'],
  ARRAY['operational excellence', 'staff accountability', 'event management', 'commercial performance', 'high standards'],
  'Ally Consultants Ltd is seeking a General Manager for The Vaults, a new multi-use venue in Stoke-on-Trent. The role requires a hands-on leader to oversee operations, manage vendors, and drive events in a fast-paced environment.',
  'I am an operations-led leader who enjoys building rhythm, standards, and accountability in busy customer-facing environments. The General Manager opportunity at Ally Consultants Ltd stands out because it combines commercial ownership, hands-on leadership, and the chance to help shape a destination venue from the ground up.',
  'What appeals to me here is the mix of frontline pace and leadership responsibility. It looks like a role where visible ownership, clear standards, and practical decision-making would matter every day, which is exactly the kind of environment where I do my best work.',
  ARRAY['venue launch discipline', 'team standards and accountability', 'event delivery rhythm', 'commercial performance visibility'],
  '',
  true
)
on conflict (ref) do nothing;

-- Second sample: NorthStar Health Services
insert into public.applications (
  user_id,
  ref,
  company_name,
  role_title,
  location,
  sector,
  salary,
  employment_type,
  short_company_reason,
  short_role_reason,
  tone_keywords,
  probable_priorities,
  advert_summary,
  personalised_intro,
  why_this_role,
  key_focus_areas,
  raw_job_advert,
  is_published
) values (
  '17900fce-9056-4b49-a666-41a30f4f3f24',
  'northstar-health-services-operations-transformation-lead-manchester',
  'NorthStar Health Services',
  'Operations Transformation Lead',
  'Manchester',
  'healthcare services',
  'Up to £72,000 a year',
  'Full-time, permanent',
  'Join a scaling healthcare provider focused on modernising patient services.',
  'Shape change across operations, reporting, and frontline service delivery.',
  ARRAY['transformational', 'patient-centred', 'analytical', 'collaborative', 'measured'],
  ARRAY['service redesign', 'performance reporting', 'stakeholder alignment', 'process consistency', 'patient experience'],
  'NorthStar Health Services is hiring an Operations Transformation Lead to improve service delivery, strengthen reporting, and coordinate change across multiple healthcare teams. The brief suggests a strong focus on practical implementation, measurable outcomes, and cross-functional alignment.',
  'I am drawn to roles where operational improvement has a direct effect on service quality. This opportunity at NorthStar Health Services feels especially relevant because it combines change leadership, data-informed decision-making, and the chance to improve the everyday experience for both teams and patients.',
  'The role looks like a strong fit because it sits at the intersection of delivery, reporting, and stakeholder coordination. I enjoy taking ambiguous operational challenges, creating structure around them, and helping teams move from intention to consistent execution.',
  ARRAY['change delivery cadence', 'service performance insight', 'cross-team alignment', 'patient journey improvement'],
  '',
  true
)
on conflict (ref) do nothing;

-- Third sample: Meridian Guest Experiences
insert into public.applications (
  user_id,
  ref,
  company_name,
  role_title,
  location,
  sector,
  salary,
  employment_type,
  short_company_reason,
  short_role_reason,
  tone_keywords,
  probable_priorities,
  advert_summary,
  personalised_intro,
  why_this_role,
  key_focus_areas,
  raw_job_advert,
  is_published
) values (
  '17900fce-9056-4b49-a666-41a30f4f3f24',
  'meridian-guest-experiences-regional-operations-manager-birmingham',
  'Meridian Guest Experiences',
  'Regional Operations Manager',
  'Birmingham',
  'leisure and hospitality',
  '£58,000-£65,000 a year',
  'Full-time',
  'Help raise standards across a growing multi-site guest experience business.',
  'Combine commercial focus, team leadership, and operational consistency across venues.',
  ARRAY['customer-led', 'high-energy', 'commercial', 'practical', 'accountable'],
  ARRAY['multi-site consistency', 'guest satisfaction', 'manager coaching', 'commercial reporting', 'operational discipline'],
  'Meridian Guest Experiences is looking for a Regional Operations Manager to improve standards across a portfolio of leisure venues. The role appears to blend hands-on site support, manager coaching, performance tracking, and a strong focus on both guest experience and commercial results.',
  'I enjoy roles where operational consistency has to coexist with pace, personality, and commercial awareness. Meridian Guest Experiences is appealing because it looks like an opportunity to support multiple venues, lift standards, and create a clearer operating rhythm across the region.',
  'This role feels like a strong match because it asks for practical leadership across people, standards, and results. I would bring a calm, structured approach to site performance while still staying close enough to operations to help teams solve the real problems that affect guests every day.',
  ARRAY['site-by-site operating rhythm', 'manager coaching and follow-through', 'guest experience consistency', 'regional performance reporting'],
  '',
  true
)
on conflict (ref) do nothing;
