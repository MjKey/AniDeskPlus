<script>
    import { createEventDispatcher } from "svelte";
    import BaseMainButton from "../buttons/BaseMainButton.svelte";
    import { localStorageWritable } from "@babichjacob/svelte-localstorage";

    const dispatch = createEventDispatcher();

    let firstRun;

    const firstRunRaw = localStorageWritable("first_run", true);
    firstRunRaw.subscribe((value) => (firstRun = value));

    export let showed;
</script>

{#if showed}
    <div class="modal-title">Внимание</div>
    <div class="modal-content">
        <p>
            Добро пожаловать! Вы используете <strong>AniDeskPlus</strong> — неофициальный форк десктоп-клиента AniDesk для Anixart, созданный для более удобного просмотра контента с Anixart на ПК. Мы не связаны с оригинальными разработчиками Anixart.
        </p>
        <p>
            Сейчас приложение находится в стадии <strong>бета-тестирования</strong>, так что могут быть баги.
        </p>
        <p>
            Спасибо, что используете наш клиент ❤️
        </p>
        <BaseMainButton style="primary" onClickCallback={() => {firstRunRaw.set(false); dispatch("closeModal");}}>Понятно</BaseMainButton>
    </div>
{/if}

<style>
    .center {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }
</style>
