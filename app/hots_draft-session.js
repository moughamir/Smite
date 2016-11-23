/**
 ***************************
 * Draft tool specific code *
 ****************************
 */

// Add draft tool specific listeners //
window.addEventListener('init', function() {
    initDraftToolUI();
    updateUI();
});

window.addEventListener('draftSessionUpdated', function() {
    updateUI();
});

window.addEventListener('stateUpdated', function() {
    updateUI();
});

function initDraftToolUI() {
    if (state.viewer.type === 'team') {
        var $body = $('body');

        // Ready buttons
        $body.on('click', '.button-holder-type-ready button.confirm', function () {
            draftSessionTeamReadyAction();
        });

        // Map picks+bans
        $body.on('click', '.draft-map .maps-pool .pickable', function () {
            if (!state.isViewerTeamsTurn()) {
                return;
            }

            var $this = $(this);
            $('.preliminary').removeClass('preliminary');
            $this.addClass('preliminary');

            // xxx: optimistically display ban
            var id = $(this).attr('data-id');
            preliminaryPickAction(id);
        });

        $body.on('click', '.draft-map .button-holder-state-confirm button.confirm', function (e) {
            if (!state.isViewerTeamsTurn()) {
                return;
            }

            var $preliminary = $('.preliminary', $body);
            $preliminary.removeClass('preliminary');
            var $banButton = $('.button-holder.button-holder-type-ban');
            removeClassesWithPrefix($banButton, 'button-holder-state-');
            $banButton.addClass('button-holder-state-waiting');

            confirmPickAction();
            e.stopPropagation();
        });

        /** Hero Draft */
        $body.on('click', '.draft-hero .pickable-available', function () {
            if (!state.isViewerTeamsTurn()) {
                return;
            }

            var $button = $('.button-holder-confirm');
            removeClassesWithPrefix($button, 'button-holder-state-');
            $button.addClass('button-holder-state-confirm');

            var id = $(this).attr('data-id');
            preliminaryPickAction(id);
        });

        $body.on('click', '.draft-hero button.confirm', function (e) {
            if (!state.isViewerTeamsTurn()) {
                return;
            }

            // xxx: optimistically display pick
            var $buttonHolder = $(this).closest('.button-holder');
            removeClassesWithPrefix($buttonHolder, 'button-holder-state-');

            confirmPickAction();
            e.stopPropagation();
        });
    }
}

/**
 */
function onTimersUpdate() {
    $('.state-lobby .timers .main').text(state.timers.lobby);

    $('.turn-team-one .timers .main').text(state.timers.teamOne.turn);
    $('.team-1.time-pool span').text(state.timers.teamOne.pool);

    $('.turn-team-two .timers .main').text(state.timers.teamTwo.turn);
    $('.team-2.time-pool span').text(state.timers.teamTwo.pool);
}

// Todo: function onTurnChange() {}

/**
 * Handle UI updates after fresh data has been fetched
 */
function updateUI() {
    var $confirmButton = $('.button-holder-confirm');

    switch (state.getRound().status) {
        case 'LOBBY':
            var lobby = state.getLobby();

            // "Ready buttons" toggle states
            var $team1ReadyButtonHolder = $('.button-holder.team-1');
            var $team2ReadyButtonHolder = $('.button-holder.team-2');

            $team1ReadyButtonHolder.toggleClass('button-holder-state-ready', lobby.teamOneReady);
            $team2ReadyButtonHolder.toggleClass('button-holder-state-ready', lobby.teamTwoReady);
            $team1ReadyButtonHolder.toggleClass('button-holder-state-confirm', !lobby.teamOneReady && state.getViewerTeamNumber() === 1);
            $team2ReadyButtonHolder.toggleClass('button-holder-state-confirm', !lobby.teamTwoReady && state.getViewerTeamNumber() === 2);
            $team1ReadyButtonHolder.toggleClass('button-holder-state-waiting-for-team', !lobby.teamOneReady && state.getViewerTeamNumber() !== 1);
            $team2ReadyButtonHolder.toggleClass('button-holder-state-waiting-for-team', !lobby.teamTwoReady && state.getViewerTeamNumber() !== 2);
            break;

        case 'DRAFT':
            var draft = state.getDraft();
            var currentPick = state.getPick();
            removeClassesWithPrefix($confirmButton, 'button-holder-state-');

            if (state.isViewerTeamsTurn()) {
                if (currentPick.pickable || $('.pickable-preliminary').length > 0) {
                    $confirmButton.addClass('button-holder-state-confirm');
                } else {
                    $confirmButton.addClass('button-holder-state-waiting');
                }
            } else {
                $confirmButton.addClass('button-holder-state-waiting-for-team');
            }

            updatePickablesPoolDisplay();
            updateMapPicksDisplay();
            updateHeroPicksDisplay();

            break;

        case 'COMPLETED':
            updatePickablesPoolDisplay();
            updateHeroPicksDisplay();

            removeClassesWithPrefix($confirmButton, 'button-holder-state-');
            $confirmButton.addClass('button-holder-state-draft-completed');

            break;
    }
}

function updatePickablesPoolDisplay() {
    var draft = state.getDraft();
    if (!draft) {
        return;
    }

    var currentPick = state.getPick();
    var pickablesWithStatus = draft.pickablesWithStatus;
    $('.pickable[data-id]').each(function(index, element) {
        var $pickable = $(element);
        var pickableId = $pickable.attr('data-id');
        var pickableData = pickablesWithStatus[pickableId];

        if (!pickableData) {
            return;
        }

        removeClassesWithPrefix($pickable, 'pickable-');
        if (pickableData.available) {
            $pickable.addClass('pickable-available');

            if (currentPick.pickable && currentPick.pickable.id === pickableId) {
                $pickable.addClass('pickable-preliminary');
            }
        } else {
            $pickable.addClass('pickable-banned');
        }
    });
}

function updateMapPicksDisplay() {
    var draft = state.getDraft();
    if (!draft || draft.type !== 'MAP') {
        return;
    }

    var $picksWrapper = $('.picks-wrapper');
    var $teamOnePicks = $('.team-1 ul', $picksWrapper).html('');
    var $teamTwoPicks = $('.team-2 ul', $picksWrapper).html('');
    var picksArr = draft.picks;
    $.each(picksArr, function(index, pick) {
        if (!pick.isConfirmed) {
            return;
        }

        var element = $('<li>' + pick.pickable.name + '</li>');
        if (pick.team.number === 1) {
            $teamOnePicks.append(element);
        } else {
            $teamTwoPicks.append(element);
        }
    });
}

function updateHeroPicksDisplay() {
    var draft = state.getDraft();
    if (!draft || draft.type !== 'HERO') {
        return;
    }

    var picksArr = draft.picks;
    var $picksWrapper = $('.picks-wrapper');
    $.each(picksArr, function(index, pick) {
        var $pick = $('.pick[data-index="' + pick.index + '"]', $picksWrapper);

        var pickable = pick.pickable;
        if (!pickable) {
            return;
        }

        var $portrait = $('.portrait', $pick);
        var imageUrl = state.viewer.type === 'team' ? pickable.avatarImage.url : pickable.observerImage.url;
        if (pick.isConfirmed || state.isViewerTeamsTurn() || state.viewer.type === 'observer') {
            $portrait.css('background-image', 'url(' + imageUrl + ')');
            $('span', $portrait).text(pickable.name);
        }

        if (pick.isConfirmed || state.isViewerTeamsTurn() || state.viewer.type === 'observer') {
            var $overlay = $('.overlay', $pick);

            // Prep the DH All-Stars template markup
            if ($('body').hasClass("template-dhallstars")) {
                $(".pick .portrait span").each(function ()
                {
                    $(this).appendTo($(this).parents(".pick").children(".overlay"));
                });

                $(".pick .portrait").each(function () {
                    $(this).appendTo($(this).parents(".pick").children(".overflow"));
                });
            }

            $portrait.css('background-image', 'url(' + imageUrl + ')');
            $('span', $overlay).text(pickable.name);
        }

        removeClassesWithPrefix($pick, 'pick-state-');
        if (pick.isConfirmed) {
            $pick.addClass('pick-state-confirmed');
        } else {
            $pick.addClass('pick-state-preliminary');
        }

        // Add pickable ID class
        $pick.addClass('pick-pickable-id-' + pick.pickable.id);
    });

    // If the same team has multiple picks in a row then they all need to be shown as "current"
    $('.pick-current').removeClass('pick-current');
    $('.pick-current-turn').removeClass('pick-current-turn');

    var currentPick = state.getPick();
    if (currentPick && state.getDraft().status !== 'COMPLETED') {
        $('.pick[data-index="' + currentPick.index + '"]', $picksWrapper).addClass('pick-current');
        var turns = state.getDraft().turns;
        for (var i = currentPick.index; i < turns.length; i++) {
            var turn = turns[i];
            var $pick = $('.pick[data-index="' + i + '"]', $picksWrapper);

            if (turn.team.number !== currentPick.team.number) {
                break;
            }

            $pick.addClass('pick-current-turn');
        }
    }
}

// Todo: Convert the below to CSS. Should be applied if the viewer
// is an observer and the amount of bans are  > 2
function moveBans() {
    var banScl = 0.8;
    var scl = 1;
    $('.team-heroes-ban').remove();
    var holder = $('<div class="team-heroes-ban team-1"></div>');
    var holder2 = $('<div class="team-heroes-ban team-2"></div>');
    holder.addClass(teamTurn === 1 ? '' : 'inactive');
    holder2.addClass(teamTurn === 2 ? '' : 'inactive');
    var bansTeamOne = $('.team-1 .hero-ban');
    var bansTeamTwo = $('.team-2 .hero-ban');
    var banCount = bansTeamOne.length;
    var banCount2 = bansTeamTwo.length;
    if (banCount > 2 || banCount2 > 2) {
        banScl -= 0.1;
        scl -= 0.1;
        if (banCount > 3 || banCount2 > 3) {
            scl -= 0.05;
        }
    }

    var pW = $('.pick').width();

    holder.append(bansTeamOne);
    holder2.append(bansTeamTwo);
    $('.team-heroes.team-1').append(holder);
    $('.team-heroes.team-2').append(holder2);
    var w = (pW * banCount);
    var sw = w * banScl;
    var left = w - (w - sw) / 2;

    holder.width(w);
    holder.css('transform', 'scale(' + banScl + ')');
    holder.css('-webkit-transform', 'scale(' + banScl + ')');
    holder.css('left', '-' + (left) + 'px');
    $('.ban-indicator.team-1').css('left', '-' + (sw) + 'px');

    w = (pW * banCount2);
    sw = w * banScl;
    left = w - (w - sw) / 2;
    holder2.width(w);
    holder2.css('transform', 'scale(' + banScl + ')');
    holder2.css('-webkit-transform', 'scale(' + banScl + ')');
    holder2.css('right', '-' + (left) + 'px');
    $('.ban-indicator.team-2').css('right', '-' + (sw) + 'px');

    var wrapper = $('.picks-wrapper');
    wrapper.css('transform', 'scale(' + scl + ')');
    wrapper.css('-webkit-transform', 'scale(' + scl + ')');
    $('.portrait span').css('font-size', '14px');
}