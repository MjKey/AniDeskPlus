<script>
    export let subTitle;
    export let title = "AniDeskPlus";
</script>

<svelte:head>
    <title>{subTitle ? `${subTitle} - ${title}` : title}</title>
</svelte:head>