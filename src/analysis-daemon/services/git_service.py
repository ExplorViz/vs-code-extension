import asyncio
from pathlib import Path


async def create_git_bundle(
    repo_path: str, branch: str | None, bundle_path: Path
) -> None:
    repo_dir = await validate_git_repository(repo_path=repo_path, branch=branch)

    proc = await asyncio.create_subprocess_exec(
        "git",
        "bundle",
        "create",
        str(bundle_path),
        branch,
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = (
            stderr.decode("utf-8", errors="replace").strip()
            or stdout.decode("utf-8", errors="replace").strip()
        )
        raise RuntimeError(
            f"git bundle create failed (exit {proc.returncode}): {err_msg}"
        )


async def get_git_remote_url(repo_path: str) -> str | None:
    if not repo_path:
        return None

    repo_dir = Path(repo_path)
    if not repo_dir.is_dir():
        return None

    proc = await asyncio.create_subprocess_exec(
        "git",
        "remote",
        "get-url",
        "origin",
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode == 0:
        url = stdout.decode("utf-8", errors="replace").strip()
        if url:
            return url

    # fallback: check if any remote exists
    remotes_proc = await asyncio.create_subprocess_exec(
        "git",
        "remote",
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    remotes_out, _ = await remotes_proc.communicate()
    if remotes_proc.returncode == 0:
        for remote_name in remotes_out.decode("utf-8", errors="replace").splitlines():
            remote_name = remote_name.strip()
            if not remote_name:
                continue
            url_proc = await asyncio.create_subprocess_exec(
                "git",
                "remote",
                "get-url",
                remote_name,
                cwd=str(repo_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            url_out, _ = await url_proc.communicate()
            if url_proc.returncode == 0:
                url = url_out.decode("utf-8", errors="replace").strip()
                if url:
                    return url

    return None


async def validate_git_repository(repo_path: str, branch: str | None) -> Path:
    if not repo_path or not repo_path.strip():
        raise ValueError("No repository path specified. Select a valid Git repository.")

    repo_dir = Path(repo_path).expanduser().resolve()
    if not repo_dir.exists() or not repo_dir.is_dir():
        raise FileNotFoundError(
            f"Selected path is not an existing directory: {repo_dir}"
        )

    check_repo = await asyncio.create_subprocess_exec(
        "git",
        "rev-parse",
        "--is-inside-work-tree",
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await check_repo.communicate()
    is_inside = out.decode("utf-8", errors="replace").strip().lower() == "true"
    if check_repo.returncode != 0 or not is_inside:
        detail = err.decode("utf-8", errors="replace").strip()
        raise ValueError(
            f"Directory '{repo_dir}' is not a valid Git repository."
            + (f" ({detail})" if detail else "")
        )

    if not branch or branch == "use current branch":
        raise ValueError(
            "A concrete Git branch must be resolved before creating a bundle."
        )

    check_branch = await asyncio.create_subprocess_exec(
        "git",
        "rev-parse",
        "--verify",
        "--quiet",
        branch,
        cwd=str(repo_dir),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await check_branch.communicate()
    if check_branch.returncode != 0:
        raise ValueError(
            f"Branch or ref '{branch}' does not exist or has no commits in '{repo_dir}'."
        )

    return repo_dir
