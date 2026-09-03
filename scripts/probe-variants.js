const AID = "frUfvecQQ3WxIB";
const KEY = "62dafa86be9543879a9b32d347c40ab9";
const PID = "1777483403406-frUfv";
const headers = { "Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/json" };

const urls = [
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/product/${AID}/${PID}?aid=${AID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/product/${PID}?aid=${AID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/products/${PID}?aid=${AID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/product/${AID}?aid=${AID}&id=${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/variant/${AID}?aid=${AID}&productId=${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/variants/${AID}/${PID}?aid=${AID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/option/${AID}?aid=${AID}&productId=${PID}`,
  `https://kyte-api-gateway.azure-api.net/api/catalogv2/options/${AID}/${PID}?aid=${AID}`,
  `https://kyte-api-gateway.azure-api.net/api/kyte-web/common/product/${PID}?aid=${AID}`,
];

(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      const hasVar = /variant|option|sabor|choice/i.test(text);
      console.log(res.status, hasVar ? "HAS_VARIANT_KEYS" : "", url.slice(0, 110));
      console.log(text.slice(0, 280).replace(/\s+/g, " "));
      console.log("---");
    } catch (e) {
      console.log("ERR", e.message, url.slice(0, 80));
    }
  }
})();
