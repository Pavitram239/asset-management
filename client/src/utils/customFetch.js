import axios from "axios";
const customFetch = axios.create({
  baseURL: "/api/v1",
});

export const organizationKey='asset-active-organization';
// A workspace belongs to this tab, like its rendered forms and retry intents.
// Never inherit the old shared localStorage selection from another tab.
customFetch.interceptors.request.use((config)=>{
  const id=sessionStorage.getItem(organizationKey);
  if(id && !config.identityContext && !config.url.startsWith('/auth/') && !config.headers.has('X-Organization-Id')) config.headers['X-Organization-Id']=id;
  return config;
});
customFetch.interceptors.response.use(response=>response,error=>{
  if(error.response?.status===401 && !error.config?.url?.startsWith('/auth/')) sessionStorage.removeItem(organizationKey);
  return Promise.reject(error);
});
export default customFetch;
