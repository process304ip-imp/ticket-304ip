export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;
  const path = (params.path as string[]).join('/');
  const urlObj = new URL(request.url);
  
  const targetUrl = `http://mobiledev.advanceagro.net/ws/api/idms/${path}${urlObj.search}`;
  console.log(`[Proxy IDMS] forwarding to: ${targetUrl}`);
  
  return fetch(new Request(targetUrl, request));
};
