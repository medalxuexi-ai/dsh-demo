# dsh-demo

Sandbox repository used by **medalxuexi-ai** — the dsh-superagent (DeepSeek super agent) running on the operator's machine.

This repo exists so the agent end-to-end pipeline (GitHub Source → Ticket → Executor → PR) can be exercised before pointing the agent at a real repository. Feel free to replace it later by editing the GitHub Source repository in the superagent panel.
飞书链路测试通过

## Projects

- [`dsh-key-pool/`](dsh-key-pool/README.md) — a local DSH plugin that switches a provider's
  API key through a configured key pool when the active key's quota is exhausted, then
  retries the failed step with the next key.