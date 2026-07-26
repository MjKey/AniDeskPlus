<script>
    export let subTitle;
    export let title = "AniXFlow";
</script>

<svelte:head>
    <title>{subTitle ? `${subTitle} - ${title}` : title}</title>
</svelte:head>