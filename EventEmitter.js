/*
 * EventEmitter, node & browser compatible implementation
 * Does not support Domain yet
 *
 * @usage
 * Init EventEmitter in your constructor

function MyObject() {
  EventEmitter.call(this);
  ...
}

 * And inherits your prototype from EventEmitter

// inherits helper
function inherits (Constructor, SuperConstructor) {
    Constructor.super_                    = SuperConstructor;
    // es5 compatible browser
    if (Object.create) {
        Constructor.prototype             = Object.create(SuperConstructor.prototype, {
            constructor : {
              value          : Constructor
              , enumerable   : false
              , writable     : true
              , configurable : true
            }
        });
    // legacy browser
    } else {
        var TempConstructor               = function () {};
        TempConstructor.prototype         = SuperConstructor.prototype;
        Constructor.prototype             = new TempConstructor;
        Constructor.prototype.constructor = Constructor;
    }
}

inherits(MyObject, EventEmitter);

 * Then define your prototype methods

MyObject.prototype.myMethod = ...;

 */
(function () {

    'use strict';

    /*** EventEmitter constructor ***/

    /*
     * EventEmitter
     *
     * @constructor
     *
     * @todo Allow configuration (emit newListener / removeListener)
     */
    function EventEmitter () {
        EventEmitter.init.call(this);
    }

    /*** Init in separate function allow patching and easyer debugging ***/

    EventEmitter.init = function () {
        this.domain        = null;
        this._events       = this._events || {};
        this._maxListeners = this._maxListeners || undefined; // @todo Get rid of maxListeners feature?
    }

    /*** Backwards-compat with node 0.10.x ***/

    EventEmitter.EventEmitter                 = EventEmitter;

    /*** Default EventEmitter properties ***/

    EventEmitter.usingDomains                 = false;
    EventEmitter.defaultMaxListeners          = 10;           // @todo Get rid of maxListeners feature?

    /*** Declare EventEmitter prototype properties ***/

    EventEmitter.prototype.domain             = undefined;
    EventEmitter.prototype._events            = undefined;
    EventEmitter.prototype._maxListeners      = undefined;    // @todo Get rid of maxListeners feature?

    /*** Define EventEmitter prototype methods ***/

    /*
     * Add listener for given event type that will be fired every time
     *
     * @param {String}   event    Event type
     * @param {Function} listener Listener function
     *
     * @throw {TypeError} if listener is not a function.
     *
     * @return {EventEmitter} Fluent interface
     *
     * @todo Get rid of this maxListeners warning?
     */
    EventEmitter.prototype.addListener        = function (event, listener) {
        if (typeof listener !== 'function') {
            throw TypeError('listener must be a function');
        }
        this.emit('newListener', event, typeof listener.listener === 'function' ? listener.listener : listener);
        var listeners = this._events[event] || (this._events[event] = [])
            , max     = this._maxListeners !== undefined ? this._maxListeners : EventEmitter.defaultMaxListeners
            , count   = listeners.push(listener)
        ;
        if (max > 0 && !listeners.warned && count > max) {
            listeners.warned = true;
            console.error('warning: possible EventEmitter memory leak detected. %d "%s" listeners added.'
                + 'Use emitter.setMaxListeners() to increase limit.', count, event);
            console.trace();
        }
        return this;
    };

    /*
     * Add listener for given event type that will be fired only once
     *
     * @param {String}   event    Event type
     * @param {Function} listener Listener function
     *
     * @throw {TypeError} If listener is not a function.
     *
     * @return {EventEmitter} Fluent interface
     */
    EventEmitter.prototype.once               = function (event, listener) {
        if (typeof listener !== 'function') {
            throw TypeError('listener must be a function');
        }
        var fired  = false
            , once = function () {
                this.removeListener(event, once);
                if (!fired) {
                    fired = true;
                    listener.apply(this, arguments);
                }
            }
        ;
        once.listener = listener;
        this.on(event, once);
        return this;
    };

    /*
     * Remove specific listener for given event type
     *
     * @param {String}   event    Event type
     * @param {Function} listener Listener function
     *
     * @throw {TypeError} If listener is not a function.
     *
     * @return {EventEmitter} Fluent interface
     */
    EventEmitter.prototype.removeListener     = function (event, listener) {
        if (typeof listener !== 'function') {
            throw TypeError('listener must be a function');
        }
        var listeners = this._events[event]
             , index  = listeners && listeners.length
        ;
        if (index) {
             // Search last index of listener in listeners
            while (~--index // Decrease and stop if index is -1
                && (!(index in listeners) || // Skip if index is not set (sparse array)
                listener !== (listeners[index].listener || listeners[index])) // Stop when listener found
            );
            if (~index) {
                listeners.splice(index, 1);
                this.emit('removeListener', event, listener);
            }
        }
        return this;
    };

    /*
     * Remove all listeners [of given event type]
     *
     * @param {String} event Optional, event type
     *
     * @return {EventEmitter} Fluent interface
     */
    EventEmitter.prototype.removeAllListeners = function (event) {
        if (arguments.length === 0) {
            if (this._events.removeListener) { // Listening for removeListener, need to emit
                // All but removeListener
                for (var key in this._events) {
                    if (key !== 'removeListener') {
                        this.removeAllListeners(key);
                    }
                }
                // Finally remove removeListener
                this.removeAllListeners('removeListener');
            }
            this._events = {};
        } else {
            var listeners = this._events[event];
            if (listeners) {
                // LIFO order
                while (listeners.length) {
                    this.removeListener(event, listeners[listeners.length - 1]);
                }
                delete this._events[event];
            }
        }
        return this;
    };

    /*
     * Get all listeners of given event type
     *
     * @param {Integer} n Maximum listeners before emitter display a warning about possible memory leak
     *
     * @return {EventEmitter} Fluent interface
     *
     * @todo Get rid of maxListeners feature?
     */
    EventEmitter.prototype.setMaxListeners    = function (n) {
      if (!typeof n === 'number' || n < 0 || isNaN(n)) {
        throw TypeError('n must be a positive number');
      }
      this._maxListeners = n;
      return this;
    };

    /*
     * Get all listeners of given event type
     *
     * @param {String} event Event type
     *
     * @return {Array} List of listeners functions
     */
    EventEmitter.prototype.listeners          = function (event) {
        return this._events[event] ?
            Array.apply(this, this._events[event]) : // fast way to make array copy
            []
        ;
    };

    /*
     * Apply all listeners of given event type
     *
     * @param {String} event  Event type
     * @param mixed  arg... Optional, argument(s) passed to event listener(s)
     *
     * @return {Boolean} Was event emitted
     */
    EventEmitter.prototype.emit               = function (event, arg1, arg2, arg3, arg4/*[, arg5] ... */ ) {
        var listeners = this._events[event]
            , length  = listeners && listeners.length
            , index   = 0
        ;
        if (!length) {
            if (event === 'error') {
                var error = arg1;
                if (this.domain) {
                    if (!error)
                        error = new Error('Uncaught, unspecified "error" event.');
                    error.domainEmitter = this;
                    error.domain        = this.domain;
                    error.domainThrown  = false;
                    this.domain.emit('error', error);
                } else {
                    throw error;
                }
            }
            return false;
        }
        switch (arguments.length) {
            case 1:
                while (index < length) {
                    listeners[index] && listeners[index++].call(this);
                }
            break;
            case 2:
                while (index < length) {
                    listeners[index] && listeners[index++].call(this, arg1);
                }
            break;
            case 3:
                while (index < length) {
                    listeners[index] && listeners[index++].call(this, arg1, arg2);
                }
            break;
            case 4:
                 while (index < length) {
                    listeners[index] && listeners[index++].call(this, arg1, arg2, arg3);
                }
            break;
            case 5:
                while (index < length) {
                    listeners[index] && listeners[index++].call(this, arg1, arg2, arg3, arg4);
                }
            break;
            default:
                for (var i = 1, len = arguments.length, args = new Array(len - 1); i < len; i++) {
                    args[i - 1] = arguments[i];
                }
                while (index < length) {
                    listeners[index] && listeners[index++].apply(this, args);
                }
        }
        return true;
    };

    /*
     * Count listeners of an event type in given emitter
     *
     * @param {EventEmitter} emitter EventEmitter to check
     * @param {String}       event   Event type
     *
     * @return {Integer} Count of event type listener(s)
     *
     * @todo Get rid of this helper?
     */
    EventEmitter.listenerCount                = function (emitter, event) {
        if (typeof emitter.listeners !== 'function') {
            throw TypeError('emitter must be compatible with EventEmitter interface');
        }
        return emitter.listeners(event).length;
    };

    /*** Alias EventEmitter prototype methods ***/

    EventEmitter.prototype.on                 = EventEmitter.prototype.addListener;
    EventEmitter.prototype.off                = EventEmitter.prototype.removeListener;

    /*** Expose EventEmitter object ***/

    if (typeof define === 'function' && define.amd) { // AMD module
        define(function () {
            return EventEmitter;
        });
    } else if (typeof module === 'object' && module.exports) { // Common Js
        module.exports = EventEmitter;
    } else {
        // Add noConflict method
        var self       = this
            , original = self.EventEmitter
        ;
        EventEmitter.noConflict = function () {
            self.EventEmitter = original;
            return EventEmitter;
        };
        // Expose to browser
        this.EventEmitter = EventEmitter;
    }

}).call(this);
