-- 011 : « la dernière information en date gagne » (Jérôme, 27/11/2026, règles 14 et 20). Plus de hiérarchie entre une correction faite à la
-- main et une lecture : la plus récente s'affiche. Exemple : correction à 120 €, puis un nouveau scan qui lit 150 € -> on affiche 150 €.
-- Tout reste gardé (scans et corrections en ajout seul) : l'historique se rejoue toujours.
-- Remplace la règle d'avant (« une correction l'emporte sur la lecture »). La vue factures garde EXACTEMENT ses colonnes (test 05).
--
-- Pour comparer sans erreur une correction et un scan faits dans la même transaction, la correction reçoit son heure exacte
-- (corrige_le = clock_timestamp(), posée par la base, comme copie_le des scans). Les corrections d'avant n'ont pas cette heure :
-- leur heure de création (cree_le) sert à sa place.

do $$ begin perform set_config('app.utilisateur', 'migration', false); end $$;

alter table public.factures_corrections add column if not exists corrige_le timestamptz;
alter table public.factures_corrections alter column corrige_le set default clock_timestamp();

create or replace function public.factures_corrections_heure() returns trigger
language plpgsql as $$
begin
  new.corrige_le := clock_timestamp();   -- jamais l'heure envoyée par la requête
  return new;
end $$;
revoke all on function public.factures_corrections_heure() from public;
grant execute on function public.factures_corrections_heure() to porte, robot_reflets;
drop trigger if exists ac_correction_heure on public.factures_corrections;
create trigger ac_correction_heure before insert on public.factures_corrections for each row execute function public.factures_corrections_heure();

-- Les clés lues (SIREN + numéro) suivent la même règle : un numéro corrigé compte seulement s'il est plus récent que le dernier scan.
create or replace function public.cles_lues_facture(p_facture_id uuid, out siren text, out numero_normalise text)
language plpgsql stable
set search_path = public, pg_temp as $$
declare v_s public.factures_scans%rowtype; v_num text; v_a_num boolean;
begin
  select * into v_s from public.factures_scans s where s.facture_id = p_facture_id order by s.rang desc limit 1;
  select true, c.valeur into v_a_num, v_num from public.factures_corrections c
    where c.facture_id = p_facture_id and c.champ = 'numero' and c.archive_le is null
      and (v_s.copie_le is null or coalesce(c.corrige_le, c.cree_le) >= v_s.copie_le)
    order by c.rang desc limit 1;
  select k.siren, k.numero_normalise into siren, numero_normalise
    from public.cles_facture(v_s.extraction, case when v_a_num then v_num else v_s.numero end) k;
end $$;

-- La facture recollée (copie de 004, seul le filtre des corrections change).
create or replace view public.factures with (security_invoker = true) as
select v.id, v.chantier_id, v.fournisseur, v.numero, v.date_facture, v.montant_ht, v.montant_tva, v.montant_ttc,
       v.statut, v.motif_refus, v.date_decision, v.decide_par, v.fichier_path, v.email_expediteur, v.email_message_id, v.created_at,
       v.extraction, v.extraction_erreur, v.alertes_a_la_decision, v.acceptee_malgre_alerte, v.motif_acceptation,
       v.fournisseur_siren, v.numero_normalise, v.iban_normalise, v.decide_par_id, v.fournisseur_id, v.etablissement_id, v.type_document,
       case when lg.n = 0 then 'non_lues'
            when v.montant_ht is null or lg.somme is null then 'lues'
            when abs((case when v.type_document = 'avoir' then abs(lg.somme) else lg.somme end) - v.montant_ht) <= 0.01 * (lg.n + 1) then 'lues'
            else 'somme_ecart' end::text as lignes_etat,
       case when lg.n = 0 then null else round(lg.somme, 2) end::numeric(12,2) as lignes_somme_ht,
       v.archivee_le, v.archivee_par, v.courriel_id
from (
  select i.id, i.chantier_id,
         case when c.a_fournisseur then c.fournisseur else s.fournisseur end as fournisseur,
         case when c.a_numero then c.numero else s.numero end as numero,
         case when c.a_date then c.date_facture::date else s.date_facture end as date_facture,
         case when c.a_ht then c.montant_ht::numeric(12,2) else s.montant_ht end as montant_ht,
         case when c.a_tva then c.montant_tva::numeric(12,2) else s.montant_tva end as montant_tva,
         case when c.a_ttc then c.montant_ttc::numeric(12,2) else s.montant_ttc end as montant_ttc,
         (case d.decision when 'accepter' then 'acceptee' when 'refuser' then 'refusee' else 'a_valider' end)::public.statut_facture as statut,
         case when d.decision in ('accepter', 'refuser') then d.motif_refus end as motif_refus,
         case when d.decision in ('accepter', 'refuser') then d.decide_le end as date_decision,
         case when d.decision in ('accepter', 'refuser') then d.decide_par end as decide_par,
         s.fichier_path, s.email_expediteur, s.email_message_id, i.cree_le as created_at, s.extraction, s.extraction_erreur,
         case when d.decision in ('accepter', 'refuser') then d.alertes_a_la_decision end as alertes_a_la_decision,
         coalesce(case when d.decision in ('accepter', 'refuser') then d.acceptee_malgre_alerte end, false) as acceptee_malgre_alerte,
         case when d.decision in ('accepter', 'refuser') then d.motif_acceptation end as motif_acceptation,
         i.fournisseur_siren, i.numero_normalise, s.iban_normalise,
         case when d.decision in ('accepter', 'refuser') then d.decide_par_id end as decide_par_id,
         i.fournisseur_id, i.etablissement_id,
         case when c.a_type then c.type_document else coalesce(s.type_document, 'facture') end as type_document,
         i.archive_le as archivee_le, i.archive_par as archivee_par, s.courriel_id
  from public.factures_identite i
  left join lateral (
    select d0.* from public.factures_decisions d0 where d0.facture_id = i.id order by d0.rang desc limit 1
  ) d on true
  left join lateral (
    select s0.* from public.factures_scans s0
    where s0.facture_id = i.id
    order by (d.decision not in ('accepter', 'refuser') or d.decision is null or s0.copie_le <= d.decide_le) desc, s0.rang desc
    limit 1
  ) s on true
  left join lateral (
    select bool_or(c0.champ = 'fournisseur') as a_fournisseur, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'fournisseur'))[1] as fournisseur,
           bool_or(c0.champ = 'numero') as a_numero, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'numero'))[1] as numero,
           bool_or(c0.champ = 'date_facture') as a_date, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'date_facture'))[1] as date_facture,
           bool_or(c0.champ = 'montant_ht') as a_ht, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'montant_ht'))[1] as montant_ht,
           bool_or(c0.champ = 'montant_tva') as a_tva, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'montant_tva'))[1] as montant_tva,
           bool_or(c0.champ = 'montant_ttc') as a_ttc, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'montant_ttc'))[1] as montant_ttc,
           bool_or(c0.champ = 'type_document') as a_type, (array_agg(c0.valeur order by c0.rang desc) filter (where c0.champ = 'type_document'))[1] as type_document
    from public.factures_corrections c0 where c0.facture_id = i.id and c0.archive_le is null
      -- La dernière information en date gagne : une correction plus ancienne que le scan affiché ne compte plus.
      and (s.copie_le is null or coalesce(c0.corrige_le, c0.cree_le) >= s.copie_le)
  ) c on true
) v
left join lateral (
  select count(*)::integer as n, sum(l.montant_ht) as somme
  from public.lignes_facture_lues l where l.facture_id = v.id and l.archive_le is null
) lg on true;

do $$ begin perform set_config('app.utilisateur', '', false); end $$;
