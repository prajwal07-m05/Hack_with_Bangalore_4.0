CREATE TABLE public.assets(
  id text PRIMARY KEY, name text NOT NULL, type text NOT NULL, line text NOT NULL,
  plant_id text NOT NULL DEFAULT 'plant-hyd-01');
CREATE TABLE public.incidents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium', status text NOT NULL DEFAULT 'open',
  fault_code text, batch_no text, technician text,
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz);
CREATE TABLE public.messages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  role text NOT NULL, content text NOT NULL DEFAULT '',
  tool_calls jsonb, memories_used jsonb, card jsonb,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.actions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.incidents(id) ON DELETE CASCADE,
  asset_id text REFERENCES public.assets(id) ON DELETE CASCADE,
  type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open', due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.outcomes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  fix_summary text NOT NULL, held boolean, followup_notes text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.memories(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL, tags text[] NOT NULL DEFAULT '{}',
  asset_id text, outcome text NOT NULL DEFAULT 'unknown', kind text NOT NULL DEFAULT 'incident',
  occurred_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.memory_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, detail text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.risk_alerts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id text NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  message text NOT NULL, severity text NOT NULL DEFAULT 'medium',
  dismissed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.handovers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brief jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.assets TO service_role; ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.incidents TO service_role; ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.messages TO service_role; ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.actions TO service_role; ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.outcomes TO service_role; ALTER TABLE public.outcomes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.memories TO service_role; ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.memory_events TO service_role; ALTER TABLE public.memory_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.risk_alerts TO service_role; ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.handovers TO service_role; ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;

INSERT INTO public.assets(id,name,type,line,plant_id) VALUES
('press-2','Tablet Press-2','Tablet Press','Line A','plant-hyd-01'),
('press-1','Tablet Press-1','Tablet Press','Line A','plant-hyd-01'),
('gran-1','High-Shear Granulator GR-1','Granulator','Line A','plant-hyd-01'),
('ac-1','Autoclave AC-1','Autoclave','Sterile Suite','plant-hyd-01'),
('cmp-1','Air Compressor CMP-1','Compressor','Utilities','plant-hyd-01'),
('conv-3','Conveyor CV-3','Conveyor','Packaging','plant-hyd-01'),
('hvac-2','HVAC Unit AHU-2','HVAC Unit','Cleanroom B','plant-hyd-01'),
('coat-1','Film Coater FC-1','Coater','Line B','plant-hyd-01');

INSERT INTO public.incidents(id,asset_id,title,description,severity,status,fault_code,batch_no,technician,created_at,resolved_at) VALUES
('6513270e-269e-0d37-f2a7-4de452e6b438','press-2','High turret vibration after lubricant change','Turret vibration rose to 6.8 mm/s within 2 shifts of switching to lubricant batch LUB-2231. Fault code VIB-207. Tablet weight variation increased on batch TB-4410.','high','resolved','VIB-207','TB-4410','R. Iyer','2026-05-25T14:00:00Z','2026-05-25T19:00:00Z'),
('5d9dc9f8-1818-e811-892f-902bd23f0824','ac-1','Door gasket temperature deviation','Chamber temperature deviated -1.8 °C during sterilisation cycle on load SL-3302. Fault TEMP-044.','high','resolved','TEMP-044','SL-3302','R. Iyer','2026-05-29T13:00:00Z','2026-05-30T08:00:00Z'),
('6f03675a-1600-a35a-0999-50d836f675cc','conv-3','Belt tracking drift','Conveyor CV-3 belt drifting to left edge, causing carton jams. Fault TRK-09.','low','resolved','TRK-09','PK-7781','R. Iyer','2026-06-02T10:00:00Z','2026-06-02T20:00:00Z'),
('0f21ddb6-6cad-4a26-8d11-6ece1738f7d9','hvac-2','Differential pressure low in Cleanroom B','AHU-2 room DP fell to 8 Pa (spec ≥10 Pa). Fault DP-501.','high','resolved','DP-501','—','P. Nair','2026-06-05T17:00:00Z','2026-06-05T23:00:00Z'),
('a09f76b5-a170-b338-3926-3059f28c105d','gran-1','Product leak at impeller shaft seal','Wet mass leaking at impeller shaft during granulation of batch GB-1180. Fault code SEAL-112. Pressure drop at seal 0.4 bar.','high','resolved','SEAL-112','GB-1180','R. Iyer','2026-06-08T13:00:00Z','2026-06-09T10:00:00Z'),
('f9ebdacc-0cb1-e29c-658c-da1495e60af5','press-1','Punch sticking on upper punches','Picking/sticking observed on batch TB-4460. Fault PCH-31.','medium','resolved','PCH-31','TB-4460','R. Iyer','2026-06-13T07:00:00Z','2026-06-14T03:00:00Z'),
('6b4cb242-4a23-d596-2217-beaddbc496cb','gran-1','Recurring shaft seal leak','Leak at impeller shaft seal again on batch GB-1197. SEAL-112 alarm. Technician noted wear on gasket face.','high','resolved','SEAL-112','GB-1197','P. Nair','2026-06-16T06:00:00Z','2026-06-16T12:00:00Z'),
('d0eda82f-8f6d-0558-4ef8-aa3892276658','coat-1','Spray gun clogging','Spray gun 3 clogging on coating batch FC-220. Fault SPR-12.','medium','resolved','SPR-12','FC-220','S. Khan','2026-06-21T14:00:00Z','2026-06-21T20:00:00Z'),
('301850c5-a38f-d547-923a-736994e3bf91','press-2','High turret vibration after lubricant change','Turret vibration rose to 7.1 mm/s within 2 shifts of switching to lubricant batch LUB-2248. Fault code VIB-207. Tablet weight variation increased on batch TB-4447.','high','resolved','VIB-207','TB-4447','R. Iyer','2026-06-27T09:00:00Z','2026-06-28T05:00:00Z'),
('0f4205b4-907a-70c3-1012-f037b64ce422','gran-1','Shaft seal leak – third occurrence','Third SEAL-112 alarm on GR-1 during batch GB-1215. Shaft run-out measured at 0.09 mm (limit 0.05).','critical','resolved','SEAL-112','GB-1215','S. Khan','2026-06-30T13:00:00Z','2026-07-01T07:00:00Z'),
('c6f87718-6d76-b07e-881e-d162ae2eb154','ac-1','Vacuum leak test failure','Vacuum leak rate 1.6 mbar/min (limit 1.3). Fault VAC-210.','high','resolved','VAC-210','SL-3361','A. Fernandes','2026-07-04T09:00:00Z','2026-07-05T06:00:00Z'),
('4cbd87ad-5c90-a958-7403-e430ec66a787','conv-3','Motor overcurrent trip','CV-3 drive tripped on OC-77 during peak packaging run.','medium','resolved','OC-77','PK-7840','S. Khan','2026-07-09T07:00:00Z','2026-07-10T08:00:00Z'),
('930d6eaf-14f4-733f-3e7d-1bfbc7a2ea20','cmp-1','High discharge temperature trip','CMP-1 tripped on HT-301 at 104 °C discharge temperature. Ambient 38 °C. Utility air pressure dipped to 5.9 bar.','medium','resolved','HT-301','—','P. Nair','2026-07-16T08:00:00Z','2026-07-17T02:00:00Z'),
('72e6cc3a-babc-ed20-57ee-05cde00902c7','hvac-2','Humidity excursion','Relative humidity 62% (limit 55%) in Cleanroom B. Fault RH-220.','medium','resolved','RH-220','—','P. Nair','2026-07-22T08:00:00Z','2026-07-22T13:00:00Z'),
('2a3af4d4-6b0a-18e8-830e-07bc1e398f10','press-1','Tablet hardness out of spec','Hardness dropped to 6.1 kP on batch TB-4521. Fault HRD-05.','medium','resolved','HRD-05','TB-4521','M. Reddy','2026-07-26T16:00:00Z','2026-07-26T23:00:00Z'),
('0a097c97-6bf4-6c69-7d2c-af82eeeacbe2','cmp-1','High discharge temperature trip','CMP-1 tripped on HT-301 at 105 °C discharge temperature. Ambient 39 °C. Utility air pressure dipped to 5.9 bar.','medium','resolved','HT-301','—','R. Iyer','2026-07-30T14:00:00Z','2026-07-31T17:00:00Z'),
('e01f5057-ca02-135e-92b1-d3f28ede0d7a','press-2','High turret vibration after lubricant change','Turret vibration rose to 7.4 mm/s within 2 shifts of switching to lubricant batch LUB-2263. Fault code VIB-207. Tablet weight variation increased on batch TB-4484.','high','resolved','VIB-207','TB-4484','M. Reddy','2026-08-02T17:00:00Z','2026-08-03T06:00:00Z'),
('7f26144b-9828-9fcd-59a5-4a7bb1fee08f','coat-1','Inlet air temperature unstable','Inlet temperature oscillating ±4 °C. Fault TMP-88.','low','resolved','TMP-88','FC-241','A. Fernandes','2026-08-08T13:00:00Z','2026-08-08T18:00:00Z'),
('451abd81-f1d6-9ed6-17f5-e837d70820fe','gran-1','Chopper motor noise','Unusual grinding noise from chopper motor during GB-1290.','low','resolved','MTR-14','GB-1290','K. Rao','2026-08-13T11:00:00Z','2026-08-14T11:00:00Z'),
('b394fb36-bb2d-420f-0f88-080b10a3d6b2','cmp-1','High discharge temperature trip','CMP-1 tripped on HT-301 at 106 °C discharge temperature. Ambient 38 °C. Utility air pressure dipped to 5.9 bar.','medium','resolved','HT-301','—','K. Rao','2026-08-20T08:00:00Z','2026-08-21T05:00:00Z'),
('72158370-d269-a9a5-ae65-8f33fe3b890b','ac-1','Door gasket temperature deviation','Chamber temperature deviation -1.5 °C on load SL-3420. TEMP-044.','high','resolved','TEMP-044','SL-3420','K. Rao','2026-08-24T08:00:00Z','2026-08-24T23:00:00Z'),
('05c6af07-58d5-563d-ab2c-d31ee3151288','cmp-1','High discharge temperature trip','CMP-1 tripped on HT-301 at 107 °C discharge temperature. Ambient 39 °C. Utility air pressure dipped to 5.9 bar.','high','resolved','HT-301','—','M. Reddy','2026-08-29T11:00:00Z','2026-08-29T19:00:00Z'),
('0f17a300-7e62-aa0a-1df9-fd789c653938','conv-3','Photo-eye false triggers','Reject station rejecting good cartons. Fault PE-03.','low','resolved','PE-03','PK-7922','M. Reddy','2026-09-04T07:00:00Z','2026-09-04T14:00:00Z'),
('6415479c-65dc-9f50-3f63-af83bd0561e6','press-2','High turret vibration after lubricant change','Turret vibration rose to 7.7 mm/s within 2 shifts of switching to lubricant batch LUB-2279. Fault code VIB-207. Tablet weight variation increased on batch TB-4521.','high','resolved','VIB-207','TB-4521','A. Fernandes','2026-09-12T18:00:00Z','2026-09-12T23:00:00Z'),
('8ca81811-66d2-2876-72fd-f2022a96fb1a','hvac-2','Differential pressure low in Cleanroom B','Room DP 9 Pa. Fault DP-501.','high','resolved','DP-501','—','S. Khan','2026-09-20T08:00:00Z','2026-09-21T13:00:00Z'),
('47469a4d-8cdb-305f-dd2e-16096e36aab0','press-1','Feeder paddle jam','Feeder paddle stalled. Fault FDR-21.','medium','resolved','FDR-21','TB-4602','A. Fernandes','2026-09-27T15:00:00Z','2026-09-28T05:00:00Z'),
('f52ddf5d-6164-99c9-e25a-7605aec6f024','cmp-1','Condensate drain stuck','Auto drain valve stuck open, air loss. Fault DRN-02.','low','resolved','DRN-02','—','S. Khan','2026-10-04T07:00:00Z','2026-10-04T12:00:00Z'),
('a8948c89-3b61-8676-26bb-7dbd2d1c9af0','coat-1','Pan drive belt slip','Pan speed fluctuating. Fault BLT-07.','medium','resolved','BLT-07','FC-266','R. Iyer','2026-10-11T07:00:00Z','2026-10-12T01:00:00Z'),
('43435cc5-2eae-05cf-96d0-cc5fd4c28c2e','ac-1','Steam trap failure','Long heat-up time on load SL-3488. Fault STM-19.','medium','resolved','STM-19','SL-3488','R. Iyer','2026-10-16T08:00:00Z','2026-10-16T15:00:00Z'),
('9c1caaf7-5e87-66ed-88da-f4016b4013ef','press-2','High turret vibration after lubricant change','Turret vibration rose to 8.0 mm/s within 2 shifts of switching to lubricant batch LUB-2290. Fault code VIB-207. Tablet weight variation increased on batch TB-4558.','high','resolved','VIB-207','TB-4558','M. Reddy','2026-10-25T13:00:00Z','2026-10-25T20:00:00Z'),
('f341e07a-83f7-3f16-dbf4-a8b2b0c4312d','conv-3','Belt tracking drift','Belt drifting again. TRK-09.','low','resolved','TRK-09','PK-8011','K. Rao','2026-10-30T13:00:00Z','2026-10-31T13:00:00Z'),
('e647cb8f-74e6-9a5d-0dd2-7a65bd628881','press-2','Turret vibration rising','Vibration 5.9 mm/s and climbing on batch TB-4655, first shift after lubricant lot LUB-2301 was loaded. VIB-207 warning.','high','open','VIB-207','TB-4655','K. Rao','2026-11-03T17:00:00Z',NULL),
('65e7e423-6472-f1a3-8f2c-6ec8cc4169a3','gran-1','Minor seepage at shaft seal','Small seepage at impeller seal on batch GB-1388, SEAL-112 warning (not alarm).','medium','open','SEAL-112','GB-1388','A. Fernandes','2026-11-04T10:00:00Z',NULL),
('66836886-a260-cd0b-7b45-145c1a81682c','cmp-1','Discharge temperature trending up','CMP-1 discharge temp 99 °C, ambient 39 °C. HT-301 pre-alarm.','medium','open','HT-301','—','S. Khan','2026-11-04T04:00:00Z',NULL),
('70ccec31-3571-810a-fc13-2d0d113db17d','hvac-2','DP fluctuation Cleanroom B','DP swinging between 9 and 12 Pa.','medium','open','DP-501','—','R. Iyer','2026-11-05T06:00:00Z',NULL);

INSERT INTO public.messages(incident_id,role,content,created_at)
SELECT id,'operator',technician||': '||description,created_at FROM public.incidents;
INSERT INTO public.outcomes(incident_id,fix_summary,held,followup_notes,created_at) VALUES
('6513270e-269e-0d37-f2a7-4de452e6b438','Re-tightened turret bolts',false,'Vibration returned 3 days later; bolts were not the cause.','2026-06-01T19:00:00Z'),
('5d9dc9f8-1818-e811-892f-902bd23f0824','Replaced door gasket and re-ran Bowie-Dick test',true,'','2026-06-06T08:00:00Z'),
('6f03675a-1600-a35a-0999-50d836f675cc','Adjusted tail pulley tracking',true,'','2026-06-09T20:00:00Z'),
('0f21ddb6-6cad-4a26-8d11-6ece1738f7d9','Replaced pre-filter bank, rebalanced dampers',true,'','2026-06-12T23:00:00Z'),
('a09f76b5-a170-b338-3926-3059f28c105d','Replaced shaft gasket (OEM part 4471)',false,'Leak recurred after 6 days.','2026-06-16T10:00:00Z'),
('f9ebdacc-0cb1-e29c-658c-da1495e60af5','Polished punch faces, applied chrome coating',true,'','2026-06-21T03:00:00Z'),
('6b4cb242-4a23-d596-2217-beaddbc496cb','Replaced shaft gasket again with upgraded PTFE gasket',false,'Leak recurred after 9 days. Gasket swap does not address root cause.','2026-06-23T12:00:00Z'),
('d0eda82f-8f6d-0558-4ef8-aa3892276658','Cleaned nozzle, increased suspension filtration to 150 mesh',true,'','2026-06-28T20:00:00Z'),
('301850c5-a38f-d547-923a-736994e3bf91','Purged lubrication lines, reverted to previous lubricant lot and re-greased punch guides',true,'Vibration back under 3 mm/s. Lubricant lot viscosity out of spec per QC.','2026-07-05T05:00:00Z'),
('0f4205b4-907a-70c3-1012-f037b64ce422','Replaced mechanical seal cartridge and realigned impeller shaft to 0.02 mm run-out',true,'No leak for 120+ days. Root cause: shaft misalignment wearing seal.','2026-07-08T07:00:00Z'),
('c6f87718-6d76-b07e-881e-d162ae2eb154','Replaced drain valve diaphragm',true,'','2026-07-12T06:00:00Z'),
('4cbd87ad-5c90-a958-7403-e430ec66a787','Replaced worn gearbox bearing',true,'','2026-07-17T08:00:00Z'),
('930d6eaf-14f4-733f-3e7d-1bfbc7a2ea20','Replaced intake filter and cleaned aftercooler fins',true,'Temperature stable at 88 °C.','2026-07-24T02:00:00Z'),
('72e6cc3a-babc-ed20-57ee-05cde00902c7','Serviced chiller coil and dehumidifier wheel',true,'','2026-07-29T13:00:00Z'),
('2a3af4d4-6b0a-18e8-830e-07bc1e398f10','Recalibrated compression force sensor',true,'','2026-08-02T23:00:00Z'),
('0a097c97-6bf4-6c69-7d2c-af82eeeacbe2','Topped up compressor oil',false,'Oil top-up did not help; filter was clogged with dust.','2026-08-07T17:00:00Z'),
('e01f5057-ca02-135e-92b1-d3f28ede0d7a','Purged lubrication lines, reverted to previous lubricant lot and re-greased punch guides',true,'Vibration back under 3 mm/s. Lubricant lot viscosity out of spec per QC.','2026-08-10T06:00:00Z'),
('7f26144b-9828-9fcd-59a5-4a7bb1fee08f','Tuned PID loop on heater',true,'','2026-08-15T18:00:00Z'),
('451abd81-f1d6-9ed6-17f5-e837d70820fe','Replaced chopper bearings',true,'','2026-08-21T11:00:00Z'),
('b394fb36-bb2d-420f-0f88-080b10a3d6b2','Replaced intake filter and cleaned aftercooler fins',true,'Temperature stable at 88 °C.','2026-08-28T05:00:00Z'),
('72158370-d269-a9a5-ae65-8f33fe3b890b','Replaced door gasket',true,'','2026-08-31T23:00:00Z'),
('05c6af07-58d5-563d-ab2c-d31ee3151288','Replaced intake filter and cleaned aftercooler fins',true,'Temperature stable at 88 °C.','2026-09-05T19:00:00Z'),
('0f17a300-7e62-aa0a-1df9-fd789c653938','Cleaned and realigned photo-eye',true,'','2026-09-11T14:00:00Z'),
('6415479c-65dc-9f50-3f63-af83bd0561e6','Purged lubrication lines, reverted to previous lubricant lot and re-greased punch guides',true,'Vibration back under 3 mm/s. Lubricant lot viscosity out of spec per QC.','2026-09-19T23:00:00Z'),
('8ca81811-66d2-2876-72fd-f2022a96fb1a','Replaced pre-filter bank',true,'','2026-09-28T13:00:00Z'),
('47469a4d-8cdb-305f-dd2e-16096e36aab0','Removed foreign material, replaced shear pin',true,'','2026-10-05T05:00:00Z'),
('f52ddf5d-6164-99c9-e25a-7605aec6f024','Replaced auto drain',true,'','2026-10-11T12:00:00Z'),
('a8948c89-3b61-8676-26bb-7dbd2d1c9af0','Replaced and re-tensioned drive belt',true,'','2026-10-19T01:00:00Z'),
('43435cc5-2eae-05cf-96d0-cc5fd4c28c2e','Replaced steam trap',true,'','2026-10-23T15:00:00Z'),
('9c1caaf7-5e87-66ed-88da-f4016b4013ef','Purged lubrication lines, reverted to previous lubricant lot and re-greased punch guides',true,'Vibration back under 3 mm/s. Lubricant lot viscosity out of spec per QC.','2026-11-01T20:00:00Z'),
('f341e07a-83f7-3f16-dbf4-a8b2b0c4312d','Adjusted tracking, replaced worn idler',NULL,'','2026-11-07T13:00:00Z');

INSERT INTO public.messages(incident_id,role,content,created_at)
SELECT o.incident_id,'system','Resolved: '||o.fix_summary,i.resolved_at FROM public.outcomes o JOIN public.incidents i ON i.id=o.incident_id;