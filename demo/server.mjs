addEventListener("fetch", async (event) => {
  event.respondWith(new Response("Hello Demo!", { status: 200 }));
});
