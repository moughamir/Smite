var infoFromUrl = {
    draftSessionId: null,
    accessKey: null,
    roundNum: null
};

var serverTimeInfo = {
    offset: null, // The "real" delay (to the precision possible)
    margin: null, // Faked margin to reduce all timers by
    lastTimeSync: null,
    fetches: []
};

var state = {
    $holder: null,
    roundIndexOverride: null,
    preliminaryPickId: null,
    lastFetch: 0,
    latestServerDraftSessionVersion: null,
    runningActions: [],
    draftSession: null,
    viewer: null,
    timers: {
        lobby: '...',
        teamOne: {
            turn: '...',
            pool: '...'
        },
        teamTwo: {
            turn: '...',
            pool: '...'
        }
    },

    isFetching: function() {
        // Todo: look over this function
        return this.runningActions.length > 0;
    },

    onActionStart: function(xhr) {
        this.runningActions.push(xhr);
    },

    onActionStop: function(xhr) {
        var deleteIndex;
        $.each(this.runningActions, function (index, el) {
            if (el === xhr) {
                deleteIndex = index;
                return false;
            }
        });

        if (deleteIndex !== undefined) {
            this.runningActions.splice(deleteIndex, 1);
        }
    },

    updateDraftSession: function (newDraftSession) {
        var oldDraftSession = this.draftSession;
        if (oldDraftSession && newDraftSession.version <= oldDraftSession.version) {
            return;
        }

        this.draftSession = newDraftSession;

        updateStateClasses();
        updateViewerClasses();
        updateTeamTurnClasses();

        if (!oldDraftSession) {
            window.dispatchEvent(new Event('init'));
        } else {
            var draftSessionUpdatedEvent = new CustomEvent('draftSessionUpdated', {
                detail: {
                    oldDraftSession: oldDraftSession,
                    newDraftSession: newDraftSession
                }
            });

            if ( (this.getRound().status !== oldDraftSession.currentRound.status ||
                this.getDraft().index !== oldDraftSession.currentRound.currentDraft.index)
            ) {
                getStateHTMLAction();
            }

            window.dispatchEvent(draftSessionUpdatedEvent);
        }
    },

    updateFromServerPayload: function (payload) {
        if (payload.viewerData) {
            this.viewer = payload.viewerData;
        }

        if (payload.draftSession) {
            this.updateDraftSession(payload.draftSession);
        }

        if (payload.html) {
            state.$holder.html(payload.html);
            window.dispatchEvent(new Event('stateUpdated'));
        }
    },

    isViewerTeamsTurn: function() {
        if (this.getRound().status === 'LOBBY') {
            return true;
        }

        if (this.getDraft().status !== 'IN_PROGRESS') {
            return false;
        }

        return this.getCurrentTurnTeamNumber() === this.getViewerTeamNumber();
    },

    viewerCanPerformAction: function() {
        return this.isViewerTeamsTurn();
    },

    getCurrentTurnTeamNumber: function () {
        if (!this.getPick()) {
            return null;
        }

        return this.getPick().team.number;
    },

    getViewerTeamNumber: function () {
        if (!this.viewer.team) {
            return null;
        }

        return this.viewer.team.number;
    },

    getRound: function() {
        return this.draftSession.currentRound;
    },

    getLobby: function() {
        return this.getRound().lobby;
    },

    getDraft: function() {
        return this.getRound().currentDraft;
    },

    getPick: function() {
        return this.getDraft().currentPick;
    },

    getTeamsLastPick: function(teamNumber) {
        var picks = this.getDraft().picks;
        for (var i = picks.length - 1; i >= 0; i--) {
            var pick = picks[i];
            if (pick.team.number === teamNumber) {
                return pick;
            }
        }

        return null;
    }
};

var logger = {
    level: 3,

    log: function(message) {
        if (this.level < 3) {
            return;
        }

        console.log(message);
    },

    warn: function(message) {
        if (this.level < 2) {
            return;
        }

        console.warn(message);
    },


    error: function(message) {
        if (this.level < 1) {
            return;
        }

        console.error(message);
    }
};

var tickIntervalRef;

$(document).ready(function() {
    extractUrlInfo();

    state.$holder = $('.state-holder');
    if (infoFromUrl.roundNum) {
        state.roundIndexOverride = parseInt(infoFromUrl.roundNum);
    }

    fetchServerTimeInfo(5);

    initSocket();

    // Get update pack from server
    var xhr = fetchAction();
    if (xhr) {
        xhr.done(function() {
            // Set up the tick
            tickIntervalRef = setInterval(tick, 100);
        });
    }
});

function initSocket() {
    var channelName = 'draftSession.' + infoFromUrl.draftSessionId;
    var socket = io('ws://:' + socketSettings.port);

    socket.on('connect', function (data) {
        socket.emit('draft-session.join', channelName);
    });

    socket.on('draft-session.update', function (data) {
        data = JSON.parse(data);

        if (!state.draftSession || data.version > state.draftSession.version) {
            state.latestServerDraftSessionVersion = data.version;
            state.updateDraftSession(data);
        }
    });

    socketSettings.enabled = true;
    socketSettings.client = socket;
    socketSettings.channel = channelName;
}

// Engine functions
function extractUrlInfo() {
    var pattern = /view\/([0-9]+)(\/([a-z0-9]{10,}))?(\/round\/([0-9]+))?/i;
    var urlMatches = location.href.match(pattern);

    infoFromUrl.draftSessionId  = parseInt(urlMatches[1]);
    infoFromUrl.accessKey       = urlMatches[3];
    infoFromUrl.roundNum        = parseInt(urlMatches[5]);
}

/**
 * Measure and update information related to the server time
 */
function fetchServerTimeInfo(timesToRun) {
    var clientStartMilliseconds = Date.now();
    $.get('/time').done(function (data)
    {
        var serverTimeMilliseconds = parseInt(data);
        var clientCurrentMilliseconds = Date.now();
        var roundTripMS = clientCurrentMilliseconds - clientStartMilliseconds;
        var offset = (serverTimeMilliseconds - clientStartMilliseconds) - (roundTripMS / 2);
        serverTimeInfo.fetches.push({
            offset: offset,
            margin: roundTripMS // Todo: Evaluate this behavior
        });

        // Calculate averages
        var totalOffset = 0, totalMargin = 0;
        $.each(serverTimeInfo.fetches, function(index, el) {
            totalOffset += el.offset;
            totalMargin += el.margin;
        });

        var numFetches = serverTimeInfo.fetches.length;
        serverTimeInfo.offset = totalOffset / numFetches;
        serverTimeInfo.margin = totalMargin / numFetches;
        serverTimeInfo.lastTimeSync = Date.now();

        // Keep running until we have a decent average
        if (numFetches < timesToRun) {
            fetchServerTimeInfo(timesToRun);
        } else {
            serverTimeInfo.fetches = [];
        }

        logger.log('--- Calculating server time offset ---');
        logger.log('Round trip time: '             + roundTripMS);
        logger.log('Server time: '                 + serverTimeMilliseconds);
        logger.log('Client time before: '          + clientStartMilliseconds);
        logger.log('Client time after: '           + clientCurrentMilliseconds);
        logger.log('Calculated server offset: '    + serverTimeInfo.offset);
        logger.log('------');
    });
}

function tick() {

    updateTimers();

    if (checkShouldFetch()) {
        fetchAction();
    }
}

function updateTimers() {
    if (serverTimeInfo.lastTimeSync === null) {
        //logger.log('Server time has not been synced yet');
        return;
    }

    state.timers.expired = false;

    var timeStamp = Math.floor(Date.now() / 1000);
    var timeLeft;
    if (state.getRound().status === 'LOBBY') {
        if (state.getLobby().expiresAt) {
            var timeLeftRaw = parseInt(state.getLobby().expiresAt) - timeStamp;
            timeLeft = timeLeftRaw - (serverTimeInfo.offset / 1000) + (serverTimeInfo.margin / 1000);
            timeLeft = timeLeft > 0 ? Math.floor(timeLeft) : 0;

            state.timers.lobby = timeLeft;
            state.timers.expired = timeLeft === 0;
        }
    } else if (state.getRound().status === 'DRAFT') {
        updateTimersForTeam(1);
        updateTimersForTeam(2);

        var currentTimers = state.getCurrentTurnTeamNumber() === 1 ? state.timers.teamOne : state.timers.teamTwo;
        state.timers.expired = (currentTimers.turn === 0 && currentTimers.pool === 0);
    }

    // Todo: Trigger timer update event instead
    onTimersUpdate();
}

function checkShouldFetch() {
    if (state.isFetching()) {
        return false;
    }

    var millisecondsSinceLastFetch = (Date.now() - state.lastFetch);
    var fetchInterval = 1000;

    // If using sockets, only perform fetches when timers are expired
    if (socketSettings.enabled) {
        return state.timers.expired && millisecondsSinceLastFetch > fetchInterval;
    }

    // Don't do any more fetches if the round is complete and we are viewing a specific round
    if (state.draftSession && !(state.getRound().status === 'COMPLETED' && state.roundIndexOverride)) {
        return millisecondsSinceLastFetch > fetchInterval;
    }

    return false;
}

function updateTimersForTeam(teamNumber) {
    var timersPreset = state.getDraft().ruleSet.timersPreset;
    var lastTeamPick = state.getTeamsLastPick(teamNumber);
    var teamTimers = teamNumber === 1 ? state.timers.teamOne : state.timers.teamTwo;

    if (!lastTeamPick) {
        teamTimers.turn = timersPreset.pickTime;
        teamTimers.pool = timersPreset.timePool;

        return;
    }

    var timePoolLeft = lastTeamPick.availableTimePool;

    if (lastTeamPick.isConfirmed) {
        var turnTotalTime = (parseInt(lastTeamPick.confirmedAt) - parseInt(lastTeamPick.startedAt));
        var timePoolUsed = -1 * (timersPreset.pickTime - turnTotalTime);

        if (timePoolUsed > 0) {
            timePoolLeft -= timePoolUsed;
        }

        teamTimers.turn = 0;
        teamTimers.pool = timePoolLeft > 0 ? Math.floor(timePoolLeft) : 0;

        return;
    }

    // This is the current pick
    var timeStamp = Math.floor(Date.now() / 1000);
    var timeElapsed = timeStamp - parseInt(lastTeamPick.startedAt) + (serverTimeInfo.offset / 1000) - (serverTimeInfo.margin / 1000); // Todo: Double check timers logic
    var timeLeft = timersPreset.pickTime - timeElapsed;

    if (timeLeft < 0) {
        timePoolLeft += timeLeft;
    }

    teamTimers.turn = timeLeft > 0 ? Math.floor(timeLeft) : 0;
    teamTimers.pool = timePoolLeft > 0 ? Math.floor(timePoolLeft) : 0;
}

function actionExecute(action, data) {
    // Build URL
    var actionBaseUrl = '/draft-session/'+ infoFromUrl.draftSessionId + '/action';
    var url = actionBaseUrl + '/' + action;
    url += window.location.search;

    // Compile post data
    if (data === undefined) {
        data = { };
    }

    data.accessKey = infoFromUrl.accessKey;

    if (state.draftSession) {
        data.lastUpdate = state.draftSession.version;
        data.roundIndex = state.getRound().index;
    }

    if (state.roundIndexOverride) {
        data.roundIndex = state.roundIndexOverride;
    }

    logger.log('Sending action: ' + action);

    var xhr = $.ajax({
        url: url,
        method: 'post',
        data: data
    }).fail(function(xhr, textStatus, errorThrown) {
        // Todo: Handle errors better
        if (textStatus !== "abort") {
            console.error('Fail: ' + textStatus);
        }
    }).always(function(data, textStatus, xhr) {
        state.onActionStop(xhr);

        if (textStatus !== "abort") {
            var payload = data.payload;
            if (data.status < 0) {
                if (!payload || payload.error) {
                    console.warn('Error return from server: ' + payload.error)
                } else {
                    alert('An internal error occurred.');
                }
            } else if (payload) {
                state.updateFromServerPayload(payload);
            }
        }
    });

    state.onActionStart(xhr);
    return xhr;
}

function updateStateClasses() {
    var $body = $('body');
    removeClassesWithPrefix($body, 'state-');

    var round = state.getRound();
    var roundStatus = round.status.toLowerCase();
    $body.addClass('state-' + roundStatus);

    if (roundStatus === 'draft') {
        $body.addClass('state-draft-' + round.currentDraft.type.toLowerCase());
    }
}

function updateViewerClasses() {
    var classesToSet = [
        'viewer-type-' + state.viewer.type
    ];

    if (state.viewer.type === 'team') {
        var teamNumber = state.getViewerTeamNumber();
        if (teamNumber === 1) {
            state.viewer.className = 'viewer-team-one';
        } else if (teamNumber === 2) {
            state.viewer.className = 'viewer-team-two';
        } else {
            logger.log('Invalid team number!');
        }

        classesToSet.push(state.viewer.className);
    }

    // Todo: Set on stateholder instead, if possible
    $('body').addClass(classesToSet.join(' '));
}

function updateTeamTurnClasses() {
    var className;
    var $body = $('body');

    removeClassesWithPrefix($body, 'turn-');
    removeClassesWithPrefix($body, 'current-pick-type-');

    var draft = state.getDraft();
    if (draft.status === 'IN_PROGRESS') {
        className = 'turn-team-' + (state.getCurrentTurnTeamNumber() === 1 ? 'one' : 'two');
        $body.addClass(className);

        if (state.isViewerTeamsTurn()) {
            $body.addClass('turn-viewer-team');
        }

        className = 'current-pick-type-' + state.getPick().type;
        $body.addClass(className);
    }

    className = 'firstpick-team-' + (draft.firstPickTeam.number === 1 ? 'one' : 'two');
    removeClassesWithPrefix($body, 'firstpick-');
    $body.addClass(className);

    className = 'secondpick-team-' + (draft.firstPickTeam.number === 1 ? 'two' : 'one');
    removeClassesWithPrefix($body, 'secondpick-');
    $body.addClass(className);
}

function fetchAction() {
    var lastUpdate = 0;
    if (state.draftSession) {
        lastUpdate = state.draftSession.version;
    }

    var requestData = {
        lastUpdate: lastUpdate
    };

    var xhr = actionExecute('fetch', requestData);
    if (xhr) {
        state.lastFetch = Date.now();
    }

    return xhr;
}

function getStateHTMLAction() {
    actionExecute('view-state');
}

function draftSessionTeamReadyAction() {
    actionExecute('ready');
}

function preliminaryPickAction(pickableId) {
    var pickObject = state.getPick();

    if (!pickObject) {
        logger.warn('No current pick!');
        return;
    }

    state.preliminaryPickId = pickableId;
    var pick = state.getPick();

    actionExecute('preliminary-pick', {
        pickIndex: pick.index,
        pickableId: pickableId
    });
}

function confirmPickAction() {
    var pick = state.getPick();
    actionExecute('confirm-pick', {
        pickIndex: pick.index,
        pickableId: state.preliminaryPickId
    });
}