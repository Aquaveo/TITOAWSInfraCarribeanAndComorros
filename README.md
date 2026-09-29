# TITO on AWS: Caribbean and Comoros

Infrastructure for running [TITO](https://github.com/AHWALab/TITOCaribbeanAndComoros) (AHWA Lab, University of Iowa) as hourly scheduled tasks on Amazon ECS Fargate, one task per country. Written in OpenTofu and deployed from GitHub Actions.

Nothing here changes TITO's own files. Each task runs AHWA's published release image with a thin wrapper around it.

## How a cycle runs

EventBridge Scheduler starts one Fargate task per country at hh:05 UTC. The wrapper in `wrapper/tito-task.sh` then:

1. Takes a lock on EFS, so a slow cycle cannot overlap the next one.
2. Copies the release's static model data from S3 and checks every file against its SHA-256 manifest.
3. Unzips the country's FIM stores.
4. Checks preconditions: EF5 runs locally, the PPS login is present, and nothing hardcoded overrides the environment. STREAM-Sat state that is missing or stale is logged as `STREAMSAT_COLD_START`.
5. Runs `operational --regions <Country>`, killed after `cycle_timeout_s` (50 minutes by default) so a hung run cannot hold the lock.
6. Uploads every cycle folder the task produced to `s3://<data bucket>/outputs/<country>/<cycle>/` (one for an hourly run, several for a hindcast). An hourly run points `latest.json` at its cycle; a hindcast leaves it alone.

Log markers drive the alarms: `TITO_TASK_FAILED`, `TITO_CYCLE_OK`, `TITO_CYCLE_SKIPPED` and `STREAMSAT_COLD_START`. Scheduler invocations that fail after 3 retries go to a per-country dead-letter queue, which also alarms.

What persists between cycles, on EFS, one folder per country:

| Mount | Holds |
| --- | --- |
| `/app/EF5_conf/states` | EF5 model states, kept 48 hours: about 2-15 GB per region, roughly double with gap-fill states |
| `/data/streamsat/state` | STREAM-Sat noise state (`STREAM_SAT_STATE_DIR`) |
| `/data/streamsat/output` | STREAM-Sat per-half-hour rainfall (`STREAM_SAT_OUTPUT_DIR`) |
| `/run/tito` | The cycle lock |

Everything else is written to the task's own disk and discarded at the end of the task.

## Layout

| Path | Contents | Applied by |
| --- | --- | --- |
| `tofu/bootstrap` | GitHub OIDC provider, deploy and plan roles, the permissions boundary for CI-created roles, the operator policy | An account admin, once |
| `tofu/shared` | ECS cluster, security groups, EFS, data bucket, ECR repository, secrets, alert topic, CloudFront | The `Deploy shared` workflow |
| `tofu/country` | Per country: EFS access points, execution, task and scheduler roles, task definition, schedule, log group, alarms | The `Deploy country` workflow |
| `tofu/countries/*.tfvars` | Size and settings per country | |
| `wrapper/` | Dockerfile, task script, S3 helper, image smoke test, tests | |
| `scripts/publish-static.sh` | Packages a TITO release's static data into S3 | The `Publish static data` workflow |
| `site/` | Status and map viewer, a static page with its unit tests | The `Publish site` workflow, on changes to `main` |
| `notebooks/tito_outputs.ipynb` | Colab notebook that checks a cycle and draws its maps | |

State lives in one S3 bucket, with the keys `tito/bootstrap.tfstate`, `tito/shared.tfstate` and `tito/country-<country>.tfstate`.

## One-time setup

1. **State bucket.** Create a private, versioned bucket in the account, for example `tito-tofu-state-<account id>`.
2. **Bootstrap (account admin).** Copy `bootstrap.tfvars.example` to `bootstrap.tfvars` and fill in the GitHub org and repo ids (`gh api repos/Aquaveo/TITOAWSInfraCarribeanAndComorros --jq '.owner.id, .id'`), then:
   ```
   cd tofu/bootstrap
   tofu init -backend-config=../backend.hcl -backend-config="key=tito/bootstrap.tfstate"
   tofu apply -var-file=bootstrap.tfvars
   ```
   Then attach the `tito-operator` policy to the operators' IAM Identity Center permission set.
3. **GitHub.** Create the environments `shared`, `guatemala`, `haiti`, `barbados`, `antigua` and `comoros`. On **all six**, add required reviewers and set the deployment branch policy to `main` only. Any workflow that can reach one of these environments gets the deploy role, which has PowerUser access. Then set these repository variables:

   | Variable | Value |
   | --- | --- |
   | `AWS_REGION` | `us-east-1` |
   | `STATE_BUCKET` | The state bucket |
   | `DATA_BUCKET` | The data bucket (`tito-data-<account id>` unless overridden) |
   | `DEPLOY_ROLE_ARN` | Bootstrap output `deploy_role_arn` |
   | `PLAN_ROLE_ARN` | Bootstrap output `plan_role_arn` |
   | `CI_BOUNDARY_ARN` | Bootstrap output `ci_boundary_arn` |

4. **Shared infrastructure.** Copy `tofu/shared/shared.tfvars.example` to `tofu/shared/shared.tfvars` with the VPC and public subnet ids, commit it, and run **Deploy shared**.
5. **Secrets.** Set the values outside OpenTofu:
   - `tito/nasa-pps-email`: a NASA PPS login registered for near-real-time data.
   - `tito/hsaf-ftp`: `{"user": "...", "password": "..."}`. Only needed for countries with `uses_hsaf = true`.

## Deploying a country

Each country's tfvars file is the record of what runs:
- `tito_version` is the full commit SHA of the country's branch in AHWA's repository.
- `data_version` labels the static data published from that commit.

Change them through a pull request, so the plan shows the exact image and data about to go live.

1. Set `tito_version` and `data_version` in `tofu/countries/<country>.tfvars` and merge to `main`.
2. **Publish static data** for the country. It checks out AHWA's repository at `tito_version` with Git LFS and publishes to `static/<country>/<data_version>/`. Versions are immutable; publishing the same label twice is refused.
3. **Deploy country** for the country.

   The workflow builds AHWA's image from the pinned commit with their own Dockerfile, then the wrapper on top, and runs the smoke test. It pushes the result to ECR as `<country>-<tito_version>-<wrapper rev>`, checks the static data exists, and applies `tofu/country`. The wrapper rev is the git tree hash of `wrapper/`, so a wrapper change always produces a new image.
4. Set `schedule_enabled = true` in the tfvars once the first manual run looks right, and deploy again.

We build AHWA's image ourselves because their release workflow publishes images only for `v*` tags, and the branches have none.

Deploy workflows run only from `main`. ECR keeps the newest 10 images per country.

Tests run on every pull request: `python3 -m unittest discover -s wrapper/tests` and `bash wrapper/tests/test_tito_task.sh`.

## Operating

- **Rerun a cycle or run a hindcast:** start the country's task definition from the ECS console or CLI. For a hindcast, override the container command, for example `hindcast "2026-07-22 00:00" "2026-07-22 06:00"`; the wrapper adds `--regions`.
- **Pause a country:** disable its schedule, `tito-<country>`. The next deploy re-enables it unless `schedule_enabled = false` is set in the tfvars.
- **Logs:** CloudWatch log group `/tito/<country>`.
- **Viewer:** the CloudFront root (`site_url` output of `tofu/shared`) shows a status card per country and the latest maps. Outputs are public under `/outputs/<country>/`: `latest.json` names the newest cycle and each cycle's `index.json` lists its files. To try the page locally, serve `site/` and open it with `?base=<CloudFront URL>/outputs`.
- **Viewer domain:** `site_domain` in `tofu/shared/shared.tfvars` (currently `tito.uffis.org`) gets its own Route 53 zone. After the first `Deploy shared`, add the `site_name_servers` output as NS records for that name in the parent zone (`uffis.org`, account 777460178571), then set `site_domain_delegated = true` and deploy again to add the certificate and alias.
- **Alert emails** come from the `ALERT_EMAILS` repository secret, a JSON list, applied by `Deploy shared`. Each address must confirm the SNS subscription email.
- **Alarms** go to the `tito-alerts` SNS topic: a failed cycle, a skipped cycle, no successful cycle in 2 hours, the scheduler failing to start a task, and STREAM-Sat running without its saved state.

## What TITO must keep stable

The wrapper depends on this contract with the TITO repository:

- **Entrypoint:** `/docker-entrypoint.sh operational --regions <Country>`, with the code under `/app` and the Python environment at `/opt/conda/envs/tito_env2`.
- **Environment variables:** `EF5_RUNTIME=local`, `EF5_MAX_WORKERS` (overrides `ef5_max_workers`), `STREAM_SAT_STATE_DIR`, `STREAM_SAT_OUTPUT_DIR`, `TITO_GPM_EMAIL`, `IMERG_PPS_EMAIL`, and the HSAF credentials.
- **Paths:** the EFS paths above, and cycle outputs as `outputs/<YYYYMMDD.HHMMSS>/`.
- **Static data layout:** `EF5_conf/basic`, `EF5_conf/parameters`, `EF5_conf/pet`, `tito_utils/qpf_utils/StormLab-GFS-realtime/params`, `fim_store/<Country>`.

## Open items with AHWA

**PPS credentials (temporary workaround).** The STREAM-Sat YAML files still hardcode a PPS email that overrides the environment. Until AHWA's fix lands, `pps_yaml_override = true` makes the wrapper blank that one value in the task's own copy of the YAML, so STREAM-Sat uses `IMERG_PPS_EMAIL` from Secrets Manager. Nothing in AHWA's repository or image changes, and only an empty value is written. Once the YAML ships with an empty value, the step finds nothing to change and does nothing. Set `pps_yaml_override = false` then to remove it. With the workaround off, the strict precondition stops the task instead.

Also pending before enabling countries:

- **HSAF FTP credentials for Comoros**, stored in `tito/hsaf-ftp`. Until they arrive, Comoros can be deployed but not scheduled.
- **Benchmarks** for Haiti, Barbados, Antigua and Comoros. Their current sizes are starting points: Barbados has 8 vCPU / 32 GiB for its 50 StormLab members, the others follow Guatemala or AHWA's estimate. Right-size them from Container Insights after the first cycles. Guatemala was measured at about 15 minutes and 14.7 GiB peak on 4 vCPU with 4 workers.

Settled with AHWA in September 2026: every country runs STREAM-Sat and StormLab, with SCaMPR gap-fill (HSAF for Comoros). State retention is 48 hours on every branch. The FIM stores ship on each branch, and `EF5_MAX_WORKERS` overrides the config.
