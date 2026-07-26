<script>
    import SelectEpisode from "../release/SelectEpisode.svelte";
    export let args = null;
    export let showed = false;
</script>

<SelectEpisode {args} {showed} on:closeModal />
