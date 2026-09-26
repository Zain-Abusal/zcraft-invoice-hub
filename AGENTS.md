<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Server logic in src/lib/*.server.ts, loaded via dynamic import inside server fn handlers — keeps secrets out of client bundle.
- Tebex variable pricing = base-unit package x quantity; invoice details in basket `custom` — Headless API has no custom price.
