/** A tiny cart page, only so that chapter 12 has a real UI for the Playwright journey. */
export const CART_PAGE = `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8"><title>Cart</title></head>
  <body>
    <h1>Gio hang</h1>
    <ul><li>TV x 1 - 1.200.000 VND</li></ul>
    <button id="place" type="button">Dat hang</button>
    <p id="result" role="status"></p>
    <script>
      document.getElementById('place').addEventListener('click', async () => {
        const id = 'web-' + Date.now();
        const res = await fetch('/orders', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer dev-token' },
          body: JSON.stringify({ id, customerId: 'c-1', lines: [{ sku: 'TV', quantity: 1, unitPrice: 1200000 }] }),
        });
        const order = await res.json();
        document.getElementById('result').textContent =
          res.ok ? 'Da dat ' + order.id + ' - tong ' + order.total + ' ' + order.currency : 'Loi: ' + order.error;
      });
    </script>
  </body>
</html>
`;
