import { createApp, defineCustomElement } from "vue";
import "@omni-ir/elements";
import App from "./App.vue";
import ProductCard from "./ProductCard.ce.vue";

// The app's own component, written in Vue and registered as a custom element for <omni-screen>.
customElements.define("demo-product-card", defineCustomElement(ProductCard));

createApp(App).mount("#app");
