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
| `/app/EF5_conf/states` | EF5 model states |
| `.../STREAM-Sat-realtime/extension/realtime/state` | STREAM-Sat noise state |
| `.../STREAM-Sat-realtime/extension/realtime/output` | STREAM-Sat per-half-hour rainfall |
| `/run/tito` | The cycle lock |

Everything else is written to the task's own disk and discarded at the end of the task.

## Layout

| Path | Contents | Applied by |
| --- | --- | --- |
| `tofu/bootstrap` | GitHub OIDC provider, deploy and plan roles, the permissions boundary for CI-created roles, the operator policy | An account admin, once |
| `tofu/shared` | ECS cluster, security groups, EFS, data bucket, ECR repository, secrets, alert topic | The `Deploy shared` workflow |
| `tofu/country` | Per country: EFS access points, execution, task and scheduler roles, task definition, schedule, log group, alarms | The `Deploy country` workflow |
| `tofu/countries/*.tfvars` | Size and settings per country | |
| `wrapper/` | Dockerfile, task script, S3 helper, image smoke test, tests | |
| `scripts/publish-static.sh` | Packages a TITO release's static data into S3 | The `Publish static data` workflow |

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

Each country's tfvars file is the record of what runs: `tito_version` is the AHWA release and `data_version` is the static data version. Change them through a pull request, so the plan shows the exact image and data about to go live.

1. **Publish static data** for the AHWA release: country, AHWA branch or tag, and a version label. Versions are immutable; publishing the same label twice is refused.
2. Set `tito_version` and `data_version` in `tofu/countries/<country>.tfvars` and merge to `main`.
3. **Deploy country** with the country.

   The workflow reads the versions from the tfvars, builds the wrapper on `ghcr.io/ahwalab/titocaribbeanandcomoros/tito-<country>:<tito_version>`, and runs the smoke test. It pushes the image to ECR as `<country>-<tito_version>-<wrapper rev>`, checks the static data exists, and applies `tofu/country`. The wrapper rev is the git tree hash of `wrapper/`, so a wrapper change always produces a new image, and an unchanged wrapper reuses the existing one.
4. Set `schedule_enabled = true` in the tfvars once the country is ready to run hourly, and deploy again.

Deploy workflows run only from `main`. ECR keeps the newest 10 images per country.

Tests run on every pull request: `python3 -m unittest discover -s wrapper/tests` and `bash wrapper/tests/test_tito_task.sh`.

## Operating

- **Rerun a cycle or run a hindcast:** start the country's task definition from the ECS console or CLI. For a hindcast, override the container command, for example `hindcast "2026-07-22 00:00" "2026-07-22 06:00"`; the wrapper adds `--regions`.
- **Pause a country:** disable its schedule, `tito-<country>`. The next deploy re-enables it unless `schedule_enabled = false` is set in the tfvars.
- **Logs:** CloudWatch log group `/tito/<country>`.
- **Alarms** go to the `tito-alerts` SNS topic: a failed cycle, a skipped cycle, no successful cycle in 2 hours, the scheduler failing to start a task, and STREAM-Sat running without its saved state.

## What TITO must keep stable

The wrapper depends on this contract with the TITO repository:

- **Entrypoint:** `/docker-entrypoint.sh operational --regions <Country>`, with the code under `/app` and the Python environment at `/opt/conda/envs/tito_env2`.
- **Environment variables:** `EF5_RUNTIME=local`, `EF5_MAX_WORKERS` (honoured when `ef5_max_workers = None`), `TITO_GPM_EMAIL`, `IMERG_PPS_EMAIL`, and the HSAF credentials.
- **Paths:** the EFS paths above, and cycle outputs as `outputs/<YYYYMMDD.HHMMSS>/`.
- **Static data layout:** `EF5_conf/basic`, `EF5_conf/parameters`, `EF5_conf/pet`, `tito_utils/qpf_utils/StormLab-GFS-realtime/params`, `fim_store/<Country>`.

## Open items with AHWA

With `TITO_STRICT_CHECKS=1`, the default, a task stops rather than run with a known problem. Until AHWA makes these changes, the following preconditions fail:

- The PPS email hardcoded in the STREAM-Sat YAML files overrides the environment.
- `ef5_max_workers` is hardcoded in Guatemala, Haiti and Barbados, so `EF5_MAX_WORKERS` is ignored.

Also pending before sizing and enabling countries:

- State retention per branch (`states_keep_hours`).
- The intended rainfall chain for Antigua and Barbuda and for Comoros.
- The location of the Antigua and Comoros FIM stores.
- Benchmarks for Haiti, Barbados, Antigua and Comoros. Guatemala was measured at about 15 minutes and 14.7 GiB peak on 4 vCPU with 4 workers.
