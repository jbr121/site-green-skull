const AID = "frUfvecQQ3WxIB";
const KEY = "62dafa86be9543879a9b32d347c40ab9";
const PROD = "kyte_prod_9f2c6e1b8a4d5f7c3e0a9d2b6c8f1e4a7d5";
const PID = "1777483403406-frUfv";

const headerSets = [
  { "Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/json" },
  { "x-api-key": PROD, "Content-Type": "application/json" },
  { "Ocp-Apim-Subscription-Key": KEY, "x-api-key": PROD, "Content-Type": "application/json" },
];

const urls = [
  `https://kyte-catalog-data.azurewebsites.net/api/product/${PID}?aid=${AID}`,
  `https://kyte-catalog-data.azurewebsites.net/api/products/${PID}?aid=${AID}`,
  `https://kyte-catalog-data.azurewebsites.net/api/catalog/product/${AID}/${PID}`,
  `https://kyte-query-public.kyte.site/api/product/${PID}?aid=${AID}`,
  `https://kyte-query-public.kyte.site/api/products/${PID}?aid=${AID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/productById/${AID}?id=${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/product-by-id/${AID}/${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/item/${AID}/${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/detail/${AID}/${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/productDetail/${AID}?productId=${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/product/${AID}?productId=${PID}&includeVariants=true`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/choices/${AID}/${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/productOptions/${AID}/${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/grid/${AID}/${PID}`,
];

(async () => {
  for (const url of urls) {
    for (const headers of headerSets.slice(0, 1)) {
      try {
        const res = await fetch(url, { headers });
        const text = await res.text();
        if (res.status === 404 && /Resource not found|Cannot GET/.test(text)) continue;
        console.log(res.status, url.replace("https://", "").slice(0, 95));
        console.log(text.slice(0, 220).replace(/\s+/g, " "));
        console.log("---");
      } catch (e) {
        console.log("ERR", e.message);
      }
    }
  }
})();
