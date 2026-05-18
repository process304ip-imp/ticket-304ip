export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;
  const path = (params.path as string[]).join('/');
  const urlObj = new URL(request.url);
  
  const targetUrl = `http://api-idms.advanceagro.net/hrms/${path}${urlObj.search}`;
  console.log(`[Proxy HRMS] forwarding to: ${targetUrl}`);
  
  return fetch(new Request(targetUrl, request));
};
