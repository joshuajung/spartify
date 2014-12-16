// ################# API-CODE

var spartify = function () {

    // Verbindung zur API aufbauen, grundsätzliche Kommunikation sicherstellen
    function Api() {}
    Api.createHandler = function (method, argNames, callback) {
        return function () {
            if (arguments.length - 2 != argNames.length) {
                console.error('Wrong number of arguments. Excepted: ' + argNames.join(', ') + ', onsuccess, onerror');
                return;a
            }

            var args = {};
            for (var i = 0; i < argNames.length; i++) {
                args[argNames[i]] = JSON.stringify(arguments[i]);
            }
            var success = arguments[i], error = arguments[i + 1];

            $.getJSON('/api/' + method, args, function (data) {
                if (data.status != 'success') {
                    console.error('API call', method, 'failed:', data.response.type, data.response.message);
                    if (error) error(data);
                    return;
                }
                callback(data, success || $.noop, error || $.noop);
            });
        };
    }

    // API-Call zur Erstellung einer Party
    // Legt eine Party im Store an und gibt dann die Party-ID zurück
    Api.prototype.createParty = Api.createHandler('start', ['event_id'], function (data, success, error) {
        success(data.response);
    });

    // API-Call zum Eintreten in eine Party
    // Legt eine User-ID für die Party fest, tritt ein und gibt dann User-ID und Queue zurück
    Api.prototype.joinParty = Api.createHandler('join', ['party_id'], function (data, success, error) {
        var res = data.response;
        if (!res) {
            error('That room doesn\'t exist');
        } else {
            success(res);
        }
    });

    // API-Call zum Abrufen der Songs einer Party
    Api.prototype.getSongs = Api.createHandler('queue', ['party_id', 'version'], function (data, success, error) {
        success(data.response);
    });

    // API-Call, um einen abgespielten Titel aus der Queue zu entfernen
    // Füllt außerdem mit Vorschlägen auf, sofern nicht mehr ausreichend Titel in der Queue vorhanden sind
    Api.prototype.pop = Api.createHandler('pop', ['party_id'], function (data, success, error) {
        success();
    });

    // API-Call zum Abstimmen für einen Titel
    Api.prototype.vote = Api.createHandler('vote', ['party_id', 'user_id', 'track_uri'], function (data, success, error) {
        success();
    });


    /*
    Api.prototype.findParties = Api.createHandler('find_parties',
    ['event_ids'],
    function (data, success, error) {
    success(data.response);
    });
    */

    return {
        api: new Api()
    };

}();


// ################# FRONTEND-CODE

(function() {

    // Code der aktuell geladenen Party
    var partyCode;

    // Aktuell spielender Song
    var playing;

    // Aktueller Queue-Inhalt
    var queue;

    // Aktuelle Queue-Version
    var queueVersion;

    // Setzt Party-Code zurück
    function clearState() {
        partyCode = null;
    }

    // Setzt Party-Code im Store (zur Persistenz) und im aktuellen Thread
    function setPartyCode(code) {
        localStorage.lastCode = code;
        partyCode = code;
    }

    // Macht aktuellen Nutzer zum Master (oder macht dies rückgängig)
    function setIsMaster(code, flag) {
        localStorage[code + ':master'] = flag;
    }

    // Schreibt User-ID in die LocalStorage
    function setUserId(code, userId) {
        localStorage[code + ':userId'] = userId;
    }

    // Gibt PartyCode-Variable aus
    function getPartyCode() {
        return partyCode || null;
    }

    // Gibt User-ID aus LocalStorage aus
    function getUserId(code) {
        if(!code) code = getPartyCode();
        return localStorage[code + ':userId'];
    }

    // Fragt ab, ob der aktuelle Nutzer Master der Party ist
    function isMaster(code) {
        if(!code) code = getPartyCode();
        return !!localStorage[code + ':master'];
    }



    // Einfache Navigation
    function go(page) {
        switch (page) {
            // PARTY-Ansicht
            case 'party':
                $('#search').val('').change();
                break;
        }

        // Setzt das Body-Attribut so, dass es die aktuell anzuzeigende Seite enthält (vermutlich zum Ein- und Ausblenden von Seitenbestandteilen)
        $('body').attr('id', 'p-' + page);
        // Setzt Navigationsbuttons auf Startseite zurück
        $('button.nav').attr('disabled', false);
        // Scrollt nach oben
        $(window).scrollTop(0);

        // Beendet Party-Modus, falls aus Party herausnavigiert wurde
        if (page != 'party') {
            stopGetSongs();
            clearState();
        }
    }

    // Navigation per direktem Pfad (nur beim ersten Aufrufen der Seite)
    function goByPath(path) {
        console.log("goByPath");
        switch (path) {
            // Redirect
            case '':
                goByPath("/");
                break;
            // Aufrufen des Root-Pfads: Bitte in Party eintreten
            case '/':
                console.log("Case '/'");
                joinParty("FIXED", function () {
                    console.log("Die Party konnte nicht betreten werden. Ggf. existiert sie noch nicht?")
                });
                break;
            // Party anlegen und als Master eintreten
            case '/callmemaster':
                spartify.api.createParty(null, function (data) {
                    // Bei Erfolg
                    setIsMaster(data.id, true);
                    joinParty(data.id);
                }, function () {
                    console.log("Die Party konnte nicht gestartet werden.")
                });
                break;
        }
    }

    // Betritt eine Party, aber nur im Frontend (muss vorher schon einmal betreten gewesen sein)
    function enterParty(code, skipPush) {
        // Legt aktuell gültige Party fest
        setPartyCode(code);
        // Schreibt Party-Code in HTML
        $('#party-code').html('Party code is: <code>' + code + '</code>');
        // Öffnet Party-Seite
        go('party');
    }

    // Betritt eine Party offiziell
    function joinParty(code, onerror, skipPush) {
        spartify.api.joinParty(code, function (data) {
            // Falls der Nutzer schon eine User-ID hat, wird diese beibehalten. Ansonsten erhält er die UserID, die die JoinParty-Funktion aus der API generiert hat.
            if (!getUserId(code)) {
                setUserId(code, data.guest);
            }
            // Nun wird die Party auch im Frontend betreten
            enterParty(code, skipPush);
            // Lädt die Queue
            songsCallback(data);
        },
        onerror);
    }

    // Richtet die ständige Aktualisierung der Queue ein
    var stopGetSongs, deferGetSongs;
    (function () {
        var timeout;

        deferGetSongs = function (delay) {
            stopGetSongs();
            timeout = setTimeout(getSongs, delay || 150);
        }

        stopGetSongs = function () {
            clearTimeout(timeout);
        }
    })();

    // Holt aktuelle Songs von der API und triggert dann den Callback
    function getSongs() {
        var code = getPartyCode();
        if (!code) return;

        spartify.api.getSongs(code, queueVersion, songsCallback, null);
    }

    // Verarbeitet Callback von der Queue-Aktualisierung und startet neuen Song, wenn nötig
    var container = $('#queue');
    function songsCallback(data) {
        deferGetSongs(5000);

        // The API won't return any data if there was no update.
        if (!data) return;
        queue = data.queue;
        queueVersion = data.version;

        $('#party-room h2').toggle(queue.length > 0);

        // Aktualisiert dargestellte Song-Queue
        fillSongList(container, queue);

        if (isMaster()) play();
    }

    // Stellt die Queue oder die Suchergebnisse im DOM dar
    function fillSongList(list, songs) {

        list.css('height', songs.length * 50);
        var lis = list.children('li'), traversed = [];
        lis.removeClass('first last');

        for (var i = 0; i < songs.length; i++) {
            var song = songs[i],
            li = list.children('li[data-uri="' + song.uri + '"]');

            if (!song || !song.uri) {
                console.error('Broken song', song, songs);
                return;
            }

            if (!li.length) {
                li = $('<li>')
                .data('song', song)
                .attr('data-uri', song.uri)
                .append(
                    $('<span class="title">').text(song.title),
                    $('<span class="artist">').text(song.artist),
                    $('<span class="vote">+1</span>'))
                    .appendTo(list);
            } else {
                traversed.push(li[0]);
            }

            if (i == 0) li.addClass('first');
            if (i == songs.length - 1) li.addClass('last');

            li.css('top', i * 50);
        }
        lis.not(traversed).remove();
    }


    // Spielt einen Song ab, aktualisiert die Progress Bar und Popt ihn, sobald er beendet ist
    function play() {
        if (!queue.length) return;

        var song = queue[0];
        if (playing == song.uri) return;

        var duration = song.length * 1000 - 50,
        li = $('#queue li[data-uri="' + song.uri + '"]');

        setTimeout(function () {
            var ids = [];
            for (var i = 0; i < queue.length; i++) {
                ids.push(queue[i].uri.split(':')[2]);
            }
            var tracksetUri = 'spotify:trackset:Spartify:' + ids;
            console.log(tracksetUri);
        }, duration - 5000);

        li.css('progress', 0);
        li.animate({progress: 100}, {
            duration: duration,
            step: function (now, fx) {
                var decl = '0, #ffa ' + now + '%, #ffe ' + now + '%';
                $(fx.elem)
                .css('background', 'linear-gradient(' + decl + ')')
                .css('background', '-moz-linear-gradient(' + decl + ')')
                .css('background', '-webkit-linear-gradient(' + decl + ')');
            },
            complete: function () {
                spartify.api.pop(getPartyCode(),
                function () {
                    deferGetSongs();
                },
                null);
            }
        });

        // Triggert Spotify, entweder per IFrame oder direkt
        playing = song.uri;
        if ($.browser.webkit) {
            $('#open').attr('src', playing);
        } else {
            location.href = playing;
        }
    }

    // Für Song Abstimmen oder neuen hinzufügen
    function vote(song) {
        var code = getPartyCode();
        spartify.api.vote(code, getUserId() || 'NO_USER_ID_' + code, song.uri,
        function () {
            queueVersion = undefined;
            deferGetSongs();
        },
        function () {
            queueVersion = undefined;
            deferGetSongs();
        });

        // Simulate the addition of the track to make UI feel snappier.
        for (var i = 0; i < queue.length; i++) {
            if (queue[i].uri == song.uri) return;
        }
        queue.push(song);
        fillSongList(container, queue);

        // TODO(blixt): Refactor away this duplicate code.
        $('#party-room h2').toggle(queue.length > 0);
    }


    // Party-Page UI
    $('.song-list li').live('click', function () {
        var li = $(this);

        // Limit clicking on an item to once per 1 sec.
        if (li.hasClass('voted')) return;
        li.addClass('voted');
        setTimeout(function () {
            li.removeClass('voted');
        }, 1000);

        vote(li.data('song'));
    });

    // Song-Suche
    (function () {
        var query = '',
        counter = 0,
        field = $('#search'),
        results = $('#results'),
        timeout;

        // Songsuche Initiieren
        function handler() {
            if (field.val() == query) return;
            query = field.val();

            clearTimeout(timeout);
            if (query) {
                timeout = setTimeout(search, 50);
            } else {
                results.empty();
                results.css('height', 0);
            }
        }

        // Songsuche durchführen
        function search() {
            counter++;
            $.getJSON('http://ws.spotify.com/search/1/track.json', {q: query}, (function (i) {
                return function (data) {
                    if (counter > i) {
                        // Another search is already in progress.
                        return;
                    }
                    handleResults(data.tracks);
                };
            })(counter));
        }

        // Ergebnisse aus Songsuche darstellen
        function handleResults(tracks) {
            var songs = [];
            for (var i = 0; i < tracks.length; i++) {
                if (i >= 5) break;
                var song = tracks[i];
                songs.push({
                    album: song.album.name,
                    artist: song.artists[0].name,
                    length: song.length,
                    title: song.name,
                    uri: song.href
                });
            }
            fillSongList(results, songs);
        }

        field.on('change keydown keypress keyup', handler);

    })();

    // Initiale Navigation durchführen
    goByPath(location.pathname);

})();
