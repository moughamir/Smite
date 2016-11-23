$(function () {
    $(document.body).on("click", 'input.select-on-click', function () {
        $(this).focus().select();
    });

    $("input[name='map[type]']").change(function () {
        toggleMapSelectionSettings();
    });

    toggleMapSelectionSettings();
    sortSelects();
});