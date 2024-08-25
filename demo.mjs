// Import the server implementation
import "./index.mjs";
$start({ port: 8080 });

addEventListener("fetch", async (event) => {
  event.respondWith(new Response(event.request.body, { status: 200 }));
});
