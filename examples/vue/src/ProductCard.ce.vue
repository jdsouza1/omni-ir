<script setup>
// The renderer sets `props` (the component's checked props, $state already read) and puts the
// component's children in the default slot.
defineProps({ props: { type: Object, default: () => ({}) } });
</script>

<template>
  <div class="card">
    <strong>{{ props.name }}</strong>
    <span>${{ Number(props.price ?? 0).toFixed(2) }}</span>
    <slot />
  </div>
</template>

<style>
.card { display: grid; gap: 4px; border: 1px solid #dde2ea; border-radius: 12px; padding: 12px; background: #fff; }
</style>
