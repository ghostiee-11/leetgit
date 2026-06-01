"""LeetGit command line: ``init`` to set up config, ``serve`` to run the service."""

from __future__ import annotations

import typer

from .config import Config, default_config_path, load_config, save_config

app = typer.Typer(add_completion=False, help="Auto-sync LeetCode solutions to GitHub.")


@app.command()
def init() -> None:
    """Interactively create the local config (GitHub token + target repo)."""
    path = default_config_path()
    if path.exists():
        if not typer.confirm(f"Config already exists at {path}. Overwrite?"):
            raise typer.Abort()

    typer.echo("Create a fine-grained GitHub PAT with read/write 'Contents' on your")
    typer.echo("solutions repo: https://github.com/settings/tokens?type=beta\n")

    token = typer.prompt("GitHub token", hide_input=True)
    repo = typer.prompt("Target repo (owner/name)")
    branch = typer.prompt("Branch", default="main")
    port = typer.prompt("Local service port", default=8765, type=int)
    region = typer.prompt("LeetCode region (com/cn)", default="com")

    try:
        config = Config(
            github_token=token,
            github_repo=repo,
            github_branch=branch,
            port=port,
            region=region,
        )
    except ValueError as exc:
        typer.secho(f"Invalid config: {exc}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    saved = save_config(config)
    typer.secho(f"Saved config to {saved}", fg=typer.colors.GREEN)
    typer.echo("Now run 'leetgit serve' and load the browser extension.")


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", help="Bind host (keep local)."),
    port: int | None = typer.Option(None, help="Override the configured port."),
) -> None:
    """Start the local sync service the extension talks to."""
    import uvicorn

    from .service import create_app

    try:
        config = load_config()
    except FileNotFoundError as exc:
        typer.secho(str(exc), fg=typer.colors.RED)
        raise typer.Exit(code=1)

    bind_port = port or config.port
    typer.secho(
        f"LeetGit serving on http://{host}:{bind_port} -> {config.github_repo} ({config.github_branch})",
        fg=typer.colors.GREEN,
    )
    uvicorn.run(create_app(config), host=host, port=bind_port)


@app.command()
def show_config() -> None:
    """Print the current config with the token redacted."""
    try:
        config = load_config()
    except FileNotFoundError as exc:
        typer.secho(str(exc), fg=typer.colors.RED)
        raise typer.Exit(code=1)
    data = config.model_dump()
    if data.get("github_token"):
        data["github_token"] = "***redacted***"
    for key, value in data.items():
        typer.echo(f"{key}: {value}")


if __name__ == "__main__":
    app()
