# clyvro

CLI and MCP server for [Clyvro](https://clyvro.vercel.app).

This is **not** an Alpine/apt package. `apk add clyvro` will not work.

## Install the command

```sh
curl -fsSL https://clyvro.vercel.app/install.sh | sh
clyvro login
```

From the published tarball (installs the `clyvro` command via npm):

```sh
npm i -g https://clyvro.vercel.app/cli/clyvro.tgz
```

From a clone of this repo:

```sh
npm i -g ./cli
```

If `clyvro` is not found after login, you ran the file with `node clyvro` — keep using `node ./clyvro …`, or run the install script so the command lands on your PATH.

## Commands

```sh
clyvro login
clyvro whoami
clyvro scan https://your-site.com --consent
clyvro review .          # thorough Code Reviewer walk; writes REVIEW.md
clyvro mcp
```

A TTY shows live progress (spinner + emoji) so a minutes-long scan is visibly working. JSON still goes to stdout for pipes and agents.
