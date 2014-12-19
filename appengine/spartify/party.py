import config
import logging
import copy

from spartify import stores
from spartify.util import create_id
from spartify.recommendations import find_similar_tracks
from spartify.playback import Queue


class Party(object):
    def __init__(self, id):
        self.id = id
        self._queue = Queue(self.id)

    def pop_track(self):
        research_base = copy.deepcopy(self._queue)
        missing_tracks = config.PARTY_QUEUE_PANIC - (len(self._queue) - 1);
        logging.info("Es fehlen " + str(missing_tracks) + " Tracks");
        if(missing_tracks > 0):
            for t in find_similar_tracks(research_base.all, missing_tracks):
                logging.info("Track hinzugefuegt")
                # add simillar track to queue, no votes.
                self._queue.add(t.to_dict(), 0)
        track, votes = self._queue.pop()
        return track

    def get_queue(self, version=None):
        if version and not version < self._queue.version:
            # No changes to the queue
            return
        return [x for x in self._queue.all], self._queue.version

    def get_event_id(self):
        return stores.parties[self.id]['event_id']

    def vote(self, user, track_uri):
        user_vote_key = '%s:%s' % (user, track_uri,)
        if user_vote_key not in stores.votes:
            self._queue.vote(track_uri)
            stores.votes.timeout_store(user_vote_key, 1, config.USER_REPEAT_VOTE_WAIT)

def exists(party_id):
    return True if party_id in stores.parties else False

def create(event_id):
    # party_id = create_id(size=5)
    party_id = "FIXED"
    stores.parties[party_id] = {'event_id': event_id}
    # quick and dirty
    stores.events[event_id] = {'party_id': party_id}
    return party_id, [], '0'

def join(party_id):
    party_id = "FIXED"
    guest_id = create_id()
    party = Party(party_id)
    return guest_id, party.get_event_id(), party.get_queue()

def find(event_ids):
    parties = {}
    for event_id in event_ids:
        try:
            parties[event_id] = stores.events[event_id]['party_id']
        except KeyError:
            pass
    return parties
