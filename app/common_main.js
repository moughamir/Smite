function removeClassesWithPrefix($object, prefix) {
    var originalClasses = $object.attr('class');
    if (originalClasses === undefined) {
        return;
    }

    var classes = originalClasses.split(" ").filter(function(c) {
        return c.lastIndexOf(prefix, 0) !== 0;
    });

    $object.attr('class', $.trim(classes.join(" ")));
}

function toggleMapSelectionSettings() {
    var mapSelection = $("input[name='map[type]']:checked").first().val();

    $('.map-selection .manual').toggle(mapSelection === 'MAPPICK_MANUAL');
    $('.map-selection .draft-settings').toggle(mapSelection === 'MAPPICK_DRAFT');
}

function sortSelects() {
    var selectObjects = $('select.sort-alphabetically');
    $.each(selectObjects, function (key, selectObject) {
        var $select = $(selectObject);
        var optionList = $('option', $select);
        optionList.sort(function(a, b){
            if (a.textContent < b.textContent) return -1;
            if (a.textContent > b.textContent) return 1;
            return 0;
        });

        $select.html(optionList);
    });
}

function preloadImages(listOfImageUrls) {
    $(listOfImageUrls).each(function(){
        (new Image()).src = this;
    });
}