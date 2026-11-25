-- Users survey v3 (2026-11-25), applies on top of 20261124100000 (v2). Run ONCE in the SQL editor of the project that holds
-- survey.survey_users_responses. Existing v1/v2 rows stay valid: every old code stays allowed and the new rules apply only
-- when answers.survey_version starts with 'users-v3'.
-- v3 changes (from the 2026-11-25 audit): Q6 splits the double-barrelled options (fake vs unavailable, commission vs broker)
-- and adds how often (q6f) and what it cost (q6c) plus two optional free-text answers (q6o before the list, q6w after);
-- Q1b buy/rent for every searcher; Q4b how many offices were contacted; Q5 split into duration (q5) and status (q5a);
-- Q8 accepts 1 to 3 choices or "none of these".

alter table survey.survey_users_responses drop constraint if exists survey_users_top_problems_chk;
alter table survey.survey_users_responses add constraint survey_users_top_problems_chk check (
  top_problems is null or (
    cardinality(top_problems) between 1 and 2
    and top_problems <@ array['fake_or_unavailable', 'no_price', 'bad_photos', 'unclear_location',
                              'hard_compare', 'commissions', 'slow_response', 'office_trust', 'other', 'none',
                              'fake_listing', 'listing_unavailable', 'high_commission', 'unreliable_broker']::text[]
    and (not ('none' = any (top_problems)) or cardinality(top_problems) = 1)));

create or replace function survey.survey_users_validate()
returns trigger
language plpgsql
set search_path = ''
as $fn$
declare
  a jsonb := new.answers;
  k text;
  allowed_keys text[] := array[
    'survey_version', 'q1', 'q2', 'q2_detail', 'q2_other', 'q3', 'q3_other', 'q4', 'q4_app_name', 'q5',
    'q6', 'q6_order', 'q7', 'q7_details', 'q8', 'q8_order', 'q9a', 'q9b', 'q9b_details', 'q9c', 'q10',
    'q11', 'q11_text', 'q12', 'q1b', 'q4b', 'q5a', 'q6f', 'q6c', 'q6o', 'q6w'];
  screened_keys text[] := array['survey_version', 'q1', 'q2', 'q2_detail', 'q2_other'];
  q3_codes text[] := array['damascus', 'rural_damascus', 'other_gov'];
  q4_codes text[] := array['facebook_groups', 'office_social', 'office_visit', 'friends', 'app_site',
                           'whatsapp_telegram', 'other'];
  q5_codes text[] := array['lt_week', 'week_to_month', 'month_to_3m', 'gt_3m', 'still_searching', 'gave_up'];
  q6_codes text[] := array['fake_or_unavailable', 'no_price', 'bad_photos', 'unclear_location', 'hard_compare',
                           'commissions', 'slow_response', 'office_trust', 'other'];
  q8_codes text[] := array['real_photos', 'clear_price', 'map_location', 'area_details', 'advertiser_info',
                           'last_updated', 'whatsapp_contact'];
  inside_codes text[] := array['damascus', 'rural_damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
                               'idlib', 'deir_ezzor', 'raqqa', 'hasakah', 'daraa', 'sweida', 'quneitra'];
  outside_codes text[] := array['germany', 'turkey', 'lebanon', 'jordan', 'uae', 'saudi', 'other_europe', 'other'];
  q6_answer_codes text[] := array['fake_or_unavailable', 'no_price', 'bad_photos', 'unclear_location', 'hard_compare',
                                  'commissions', 'slow_response', 'office_trust', 'other', 'none'];
  v3 boolean := coalesce(a ->> 'survey_version', '') like 'users-v3%';
  q5_v3_codes text[] := array['lt_week', 'week_to_month', 'month_to_3m', 'gt_3m'];
  q5a_codes text[] := array['found', 'still_searching', 'gave_up'];
  q6_v3_codes text[] := array['fake_listing', 'listing_unavailable', 'no_price', 'bad_photos', 'unclear_location',
                              'hard_compare', 'high_commission', 'unreliable_broker', 'slow_response', 'office_trust', 'other'];
  q6c_codes text[] := array['time', 'money', 'missed_opportunity', 'nothing'];
  q4b_codes text[] := array['none', '1_2', '3_5', 'gt5', 'unknown'];
  q1b_codes text[] := array['buy', 'rent', 'both', 'undecided'];
  arr text[];
  ord text[];
  k2 text;
begin
  -- fixed key set
  for k in select jsonb_object_keys(a) loop
    if not (k = any (allowed_keys)) then
      raise exception using errcode = '23514', message = 'survey: unknown answers key';
    end if;
  end loop;

  if not v3 and a ?| array['q1b', 'q4b', 'q5a', 'q6f', 'q6c', 'q6o', 'q6w'] then
    raise exception using errcode = '23514', message = 'survey: v3 answers in a pre-v3 row';
  end if;

  if a ->> 'survey_version' is null or char_length(a ->> 'survey_version') > 40 then
    raise exception using errcode = '23514', message = 'survey: survey_version missing';
  end if;
  if new.started_at is null or new.duration_sec is null or new.started_at > now() + interval '2 days' then
    raise exception using errcode = '23514', message = 'survey: started_at / duration_sec invalid';
  end if;

  -- Q1 / Q2 always present and mirrored in the columns
  if jsonb_typeof(a -> 'q1') is distinct from 'string' or a ->> 'q1' is distinct from new.status then
    raise exception using errcode = '23514', message = 'survey: q1 mismatch';
  end if;
  if jsonb_typeof(a -> 'q2') is distinct from 'string' or a ->> 'q2' is distinct from new.residence
     or a ->> 'q2_detail' is distinct from new.residence_detail then
    raise exception using errcode = '23514', message = 'survey: q2 mismatch';
  end if;
  if (new.residence = 'inside' and not (new.residence_detail = any (inside_codes)))
     or (new.residence = 'outside' and not (new.residence_detail = any (outside_codes))) then
    raise exception using errcode = '23514', message = 'survey: residence_detail does not fit residence';
  end if;
  if a ? 'q2_other' and (new.residence_detail <> 'other' or jsonb_typeof(a -> 'q2_other') <> 'string'
                         or char_length(a ->> 'q2_other') not between 1 and 100) then
    raise exception using errcode = '23514', message = 'survey: q2_other invalid';
  end if;

  -- Screened-out path: Q1 + Q2 only, nothing else, no contact
  if new.screened_out then
    for k in select jsonb_object_keys(a) loop
      if not (k = any (screened_keys)) then
        raise exception using errcode = '23514', message = 'survey: screened-out row carries later answers';
      end if;
    end loop;
    if new.top_problems is not null or new.fake_listing_experience is not null or new.try_likelihood is not null
       or new.contact_consent or new.contact_name is not null or new.contact_whatsapp is not null then
      raise exception using errcode = '23514', message = 'survey: screened-out row carries later answers';
    end if;
    return new;
  end if;

  -- Q1b (v3): what the searcher looks for
  if v3 and not (coalesce(a ->> 'q1b', '') = any (q1b_codes)) then
    raise exception using errcode = '23514', message = 'survey: q1b invalid';
  end if;

  -- Q3 areas: non-empty distinct subset
  if jsonb_typeof(a -> 'q3') is distinct from 'array' or jsonb_array_length(a -> 'q3') = 0 then
    raise exception using errcode = '23514', message = 'survey: q3 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q3'));
  if not (arr <@ q3_codes) or cardinality(arr) <> (select count(distinct x) from unnest(arr) x) then
    raise exception using errcode = '23514', message = 'survey: q3 invalid';
  end if;
  if a ? 'q3_other' and (not ('other_gov' = any (arr)) or char_length(a ->> 'q3_other') not between 1 and 100) then
    raise exception using errcode = '23514', message = 'survey: q3_other invalid';
  end if;

  -- Q4 channels
  if jsonb_typeof(a -> 'q4') is distinct from 'array' or jsonb_array_length(a -> 'q4') = 0 then
    raise exception using errcode = '23514', message = 'survey: q4 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q4'));
  if not (arr <@ q4_codes) or cardinality(arr) <> (select count(distinct x) from unnest(arr) x) then
    raise exception using errcode = '23514', message = 'survey: q4 invalid';
  end if;
  if a ? 'q4_app_name' and (not ('app_site' = any (arr)) or char_length(a ->> 'q4_app_name') not between 1 and 100) then
    raise exception using errcode = '23514', message = 'survey: q4_app_name invalid';
  end if;

  -- Q4b (v3, optional): how many offices or brokers were contacted
  if a ? 'q4b' and not (coalesce(a ->> 'q4b', '') = any (q4b_codes)) then
    raise exception using errcode = '23514', message = 'survey: q4b invalid';
  end if;

  -- Q5: v1/v2 mixed duration and status in one question; v3 asks duration (q5) and status (q5a) separately
  if v3 then
    if not (coalesce(a ->> 'q5', '') = any (q5_v3_codes)) or not (coalesce(a ->> 'q5a', '') = any (q5a_codes)) then
      raise exception using errcode = '23514', message = 'survey: q5 / q5a invalid';
    end if;
  elsif not (coalesce(a ->> 'q5', '') = any (q5_codes)) then
    raise exception using errcode = '23514', message = 'survey: q5 invalid';
  end if;

  -- Q6: 1-2 distinct codes (or "none" alone), mirrored in top_problems; q6_order lists the shown problem codes, "other" last
  if jsonb_typeof(a -> 'q6') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q6 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q6'));
  if cardinality(arr) not between 1 and 2
     or not (arr <@ (case when v3 then q6_v3_codes || array['none'] else q6_answer_codes end))
     or ('none' = any (arr) and cardinality(arr) <> 1)
     or cardinality(arr) <> (select count(distinct x) from unnest(arr) x)
     or new.top_problems is null or not (arr <@ new.top_problems and new.top_problems <@ arr)
     or cardinality(new.top_problems) <> cardinality(arr) then
    raise exception using errcode = '23514', message = 'survey: q6 / top_problems mismatch';
  end if;
  if jsonb_typeof(a -> 'q6_order') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q6_order missing';
  end if;
  ord := array(select jsonb_array_elements_text(a -> 'q6_order'));
  if v3 then
    if cardinality(ord) <> 11 or not (ord <@ q6_v3_codes and q6_v3_codes <@ ord) or ord[11] <> 'other' then
      raise exception using errcode = '23514', message = 'survey: q6_order invalid';
    end if;
    -- q6f: how often, one entry per chosen problem (none of them when "none" was chosen)
    if 'none' = any (arr) then
      if a ?| array['q6f', 'q6c', 'q6w'] then
        raise exception using errcode = '23514', message = 'survey: q6 follow-ups without a problem';
      end if;
    else
      if jsonb_typeof(a -> 'q6f') is distinct from 'object' then
        raise exception using errcode = '23514', message = 'survey: q6f missing';
      end if;
      for k2 in select jsonb_object_keys(a -> 'q6f') loop
        if not (k2 = any (arr)) or not ((a -> 'q6f' ->> k2) in ('once', 'several', 'most')) then
          raise exception using errcode = '23514', message = 'survey: q6f invalid';
        end if;
      end loop;
      if (select count(*) from jsonb_object_keys(a -> 'q6f')) <> cardinality(arr) then
        raise exception using errcode = '23514', message = 'survey: q6f incomplete';
      end if;
      if a ? 'q6c' then
        if jsonb_typeof(a -> 'q6c') is distinct from 'array' or jsonb_array_length(a -> 'q6c') = 0 then
          raise exception using errcode = '23514', message = 'survey: q6c invalid';
        end if;
        ord := array(select jsonb_array_elements_text(a -> 'q6c'));
        if not (ord <@ q6c_codes) or cardinality(ord) <> (select count(distinct x) from unnest(ord) x)
           or ('nothing' = any (ord) and cardinality(ord) <> 1) then
          raise exception using errcode = '23514', message = 'survey: q6c invalid';
        end if;
      end if;
      if a ? 'q6w' and (jsonb_typeof(a -> 'q6w') <> 'string' or char_length(a ->> 'q6w') not between 1 and 300) then
        raise exception using errcode = '23514', message = 'survey: q6w invalid';
      end if;
    end if;
    if a ? 'q6o' and (jsonb_typeof(a -> 'q6o') <> 'string' or char_length(a ->> 'q6o') not between 1 and 300) then
      raise exception using errcode = '23514', message = 'survey: q6o invalid';
    end if;
  else
    if cardinality(ord) <> 9 or not (ord <@ q6_codes and q6_codes <@ ord) or ord[9] <> 'other' then
      raise exception using errcode = '23514', message = 'survey: q6_order invalid';
    end if;
  end if;

  -- Q7 + optional details only after a "yes"
  if a ->> 'q7' is distinct from new.fake_listing_experience or new.fake_listing_experience is null then
    raise exception using errcode = '23514', message = 'survey: q7 mismatch';
  end if;
  if a ? 'q7_details' and (new.fake_listing_experience not in ('yes_multiple', 'yes_once')
                           or char_length(a ->> 'q7_details') not between 1 and 300) then
    raise exception using errcode = '23514', message = 'survey: q7_details invalid';
  end if;

  -- Q8: v1/v2 exactly 3 distinct codes; v3 1 to 3 distinct codes, or "none" alone; q8_order is a permutation of the 7 codes
  if jsonb_typeof(a -> 'q8') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q8 missing';
  end if;
  arr := array(select jsonb_array_elements_text(a -> 'q8'));
  if v3 then
    if cardinality(arr) not between 1 and 3 or not (arr <@ (q8_codes || array['none']))
       or (select count(distinct x) from unnest(arr) x) <> cardinality(arr)
       or ('none' = any (arr) and cardinality(arr) <> 1) then
      raise exception using errcode = '23514', message = 'survey: q8 invalid';
    end if;
  elsif cardinality(arr) <> 3 or not (arr <@ q8_codes) or (select count(distinct x) from unnest(arr) x) <> 3 then
    raise exception using errcode = '23514', message = 'survey: q8 invalid';
  end if;
  if jsonb_typeof(a -> 'q8_order') is distinct from 'array' then
    raise exception using errcode = '23514', message = 'survey: q8_order missing';
  end if;
  ord := array(select jsonb_array_elements_text(a -> 'q8_order'));
  if cardinality(ord) <> 7 or not (ord <@ q8_codes and q8_codes <@ ord) then
    raise exception using errcode = '23514', message = 'survey: q8_order invalid';
  end if;

  -- Q9: only for residence = outside
  if new.residence = 'inside' then
    if a ?| array['q9a', 'q9b', 'q9b_details', 'q9c'] then
      raise exception using errcode = '23514', message = 'survey: q9 answers for a participant inside Syria';
    end if;
  else
    if not (coalesce(a ->> 'q9a', '') in ('yes', 'no')) or not (coalesce(a ->> 'q9c', '') in ('yes', 'maybe', 'no')) then
      raise exception using errcode = '23514', message = 'survey: q9a / q9c missing';
    end if;
    if (a ->> 'q9a' = 'yes') <> (a ? 'q9b') then
      raise exception using errcode = '23514', message = 'survey: q9b must follow q9a = yes';
    end if;
    if a ? 'q9b' and not (a ->> 'q9b' in ('answered', 'blank')) then
      raise exception using errcode = '23514', message = 'survey: q9b invalid';
    end if;
    if (coalesce(a ->> 'q9b', '') = 'answered') <> (a ? 'q9b_details')
       or (a ? 'q9b_details' and char_length(a ->> 'q9b_details') not between 1 and 300) then
      raise exception using errcode = '23514', message = 'survey: q9b_details invalid';
    end if;
  end if;

  -- Q10 mirrored
  if jsonb_typeof(a -> 'q10') is distinct from 'number' or new.try_likelihood is null
     or (a ->> 'q10') <> new.try_likelihood::text then
    raise exception using errcode = '23514', message = 'survey: q10 mismatch';
  end if;

  -- Q11 optional text
  if not (coalesce(a ->> 'q11', '') in ('answered', 'blank'))
     or (a ->> 'q11' = 'answered') <> (a ? 'q11_text')
     or (a ? 'q11_text' and char_length(a ->> 'q11_text') not between 1 and 300) then
    raise exception using errcode = '23514', message = 'survey: q11 invalid';
  end if;

  -- Q12: consent recorded only with a number; answers.q12 mirrors the column
  if not (coalesce(a ->> 'q12', '') in ('consented', 'not_consented'))
     or (a ->> 'q12' = 'consented') <> new.contact_consent
     or (new.contact_consent and new.contact_whatsapp is null) then
    raise exception using errcode = '23514', message = 'survey: q12 / contact mismatch';
  end if;

  return new;
end;
$fn$;

revoke all on function survey.survey_users_validate() from public, anon, authenticated;
notify pgrst, 'reload schema';
