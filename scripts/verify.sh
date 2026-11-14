cd .vitepress/dist
echo "html pages: $(find . -name '*.html' | wc -l)"
echo "mermaid components (SSR): $(grep -o 'class="mermaid-wrap"' -r . --include=*.html | wc -l)"
echo "github tree/blob links:"
grep -oh 'href="https://github.com/nghiadevdevops/backend-handbook/\(tree\|blob\)/main/[^"]*"' -r . --include=*.html | sort -u | head -30
echo "rewritten:"
ls roadmap.html books/sdd/index.html books/git-workflow/index.html credits.html 404.html
grep -c "lab/" books/observability/index.html
