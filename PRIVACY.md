# Privacy Policy

**Agentic SDLC** is a Claude Code plugin that runs entirely within your own Claude Code
environment. It consists of Markdown agent definitions, phase playbooks, templates, and one
zero-dependency Node.js script — there is no companion server or hosted service.

## Data collection

The plugin collects **no personal data**. It contains no telemetry, no analytics, and no
tracking of any kind. It does not transmit your code, prompts, requirements, or any other
information to the plugin author or to any service operated by the plugin author.

## Where your data lives

Every artifact the plugin produces — requirements, user stories, design documents, ADRs, and the
`sdlc-metadata.yml` state file — is written to **your own repository** on your own machine.
Nothing is stored or processed off your device by the plugin.

## Network access

The plugin itself makes no network requests. Any network activity happens only through tools you
(or Claude Code) explicitly invoke during a run — for example `git` or the GitHub CLI (`gh`)
operating on your own repository — governed by those tools and your own credentials, not by this
plugin.

## Third parties

Running the plugin uses Claude Code and Anthropic's models, which are governed by Anthropic's own
privacy policy and terms. This document covers only the plugin's own behavior.

## Contact

Questions or concerns: <https://github.com/orchestratedbyalex/agentic-sdlc-plugin/issues>

_Last updated: 2026-06-29._
