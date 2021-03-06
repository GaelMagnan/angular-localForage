(function(window, angular, localforage, undefined) {
	'use strict';

	var angularLocalForage = angular.module('LocalForageModule', ['ng']);
	angularLocalForage.provider('$localForage', function() {
        var lfInstances = {},
	        defaultConfig = {
		        name: 'lf'
	        },
            // Send signals for each of the following actions ?
	        notify = {
		        setItem: false,
		        removeItem: false
	        },
	        watchers = {};

		// Setter for notification config, itemSet & itemRemove should be booleans
		this.setNotify = function(itemSet, itemRemove) {
			notify = {
				setItem: itemSet,
				removeItem: itemRemove
			};
		};

		this.config = function(config) {
			if(!angular.isObject(config)) {
				throw new Error('The config parameter should be an object');
			}
			angular.extend(defaultConfig, config);
		};

		this.$get = ['$rootScope', '$q', '$parse', function($rootScope, $q, $parse) {
			var LocalForageInstance = function LocalForageInstance(params) {
				if(angular.isDefined(params)) {
					this._localforage = localforage.createInstance(params);
				} else {
					this._localforage = localforage;
					localforage.config(defaultConfig);
				}
			};

			LocalForageInstance.prototype.createInstance = function createInstance(config) {
				if(angular.isObject(config)) { // create new instance
					config = angular.extend({}, defaultConfig, config);
					if(angular.isDefined(lfInstances[config.name])) {
						throw new Error('A localForage instance with the name '+ config.name +' is already defined.');
					}

					lfInstances[config.name] = new LocalForageInstance(config);
					return lfInstances[config.name];
				} else {
					throw new Error('The parameter should be a config object.')
				}
			};

			LocalForageInstance.prototype.instance = function instance(name) {
				if(angular.isUndefined(name)) {
					return lfInstances[defaultConfig.name];
				} else if(angular.isString(name)) {
					if(angular.isDefined(lfInstances[name])) {
						return lfInstances[name];
					} else {
						throw new Error('No localForage instance of that name exists.')
					}
				} else {
					throw new Error('The parameter should be a string.')
				}
			};

			// Setter for the storage driver
			LocalForageInstance.prototype.setDriver = function setDriver(driver) {
				return this._localforage.setDriver(driver);
			};

			// Getter for the storage driver
			LocalForageInstance.prototype.driver = function driver() {
				return this._localforage.driver();
			};

			// Directly adds a value to storage
			LocalForageInstance.prototype.setItem = function setItem(key, value) {
				// throw error on undefined key, we allow undefined value because... why not ?
				if(angular.isUndefined(key)) {
					throw new Error("You must define a key to set");
				}

				var deferred = $q.defer(),
					args = arguments,
					localCopy = angular.copy(value),
					self = this;

				//avoid $promises attributes from value objects, if present.
				if (angular.isObject(localCopy) && angular.isDefined(localCopy.$promise)) {
					delete localCopy.$promise; //delete attribut from object structure.
				}

				self._localforage.setItem(self.prefix() + key, localCopy).then(function success() {
					if(notify.setItem) {
						$rootScope.$broadcast('LocalForageModule.setItem', {key: key, newvalue: localCopy, driver: self.driver()});
					}
					deferred.resolve(localCopy);
				}, function error(data) {
					self.onError(data, args, self.setItem, deferred);
				});

				return deferred.promise;
			};

			// Directly get a value from storage
			LocalForageInstance.prototype.getItem = function getItem(key) {
				// throw error on undefined key
				if(angular.isUndefined(key)) {
					throw new Error("You must define a key to get");
				}

				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.getItem(self.prefix() + key).then(function success(item) {
					deferred.resolve(item);
				}, function error(data) {
					self.onError(data, args, self.getItem, deferred);
				});
				return deferred.promise;
			};


			// Get all the values for which the filter function returns true
			// filter should be a function that takes two parameters key, value and returns a boolean
			// return a list of item
			LocalForageInstance.prototype.search = function search(filter) {
				// throw error on undefined key
				if(angular.isUndefined(filter)) {
					throw new Error("You must define a filter");
				}
				if(!angular.isFunction(filter)) {
					throw new Error("filter must be a function");
				}
				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.keys().then(function success(keyList) {
					var promises = [],
						datas = [],
						ret = [];
					angular.forEach(keyList, function(key){
						var d = $q.defer()
						self._localforage.getItem(self.prefix() + key)
						.then(function success(item) {
							datas.push({'key': key, 'value': item});
							d.resolve();
						},function failure(err){
							self.onError(data, args, self.search, deferred);
						});
						promises.push(d.promise);
					});
					$q.all(promises).then(function(){
						angular.forEach(datas, function(data){
							var key = data['key'],
								value = data['value'];
							if(filter(key, value))
								ret.push(value);
						});
						deferred.resolve(ret);
					},function(err){
						self.onError(data, args, self.search, deferred);
					});
				}, function error(data) {
					self.onError(data, args, self.search, deferred);
					deferred.reject(data)
				});
				return deferred.promise;
			};

			// Remove an item from storage
			LocalForageInstance.prototype.removeItem = function removeItem(key) {
				// throw error on undefined key
				if(angular.isUndefined(key)) {
					throw new Error("You must define a key to remove");
				}

				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.removeItem(self.prefix() + key).then(function success() {
					deferred.resolve();
				}, function error(data) {
					self.onError(data, args, self.removeItem, deferred);
				});

				if(notify.removeItem) {
					return deferred.promise.then(function(value) {
						$rootScope.$broadcast('LocalForageModule.removeItem', {key: key, driver: self.driver()});
					});
				} else {
					return deferred.promise;
				}
			};

			// Remove all data for this app from storage
			LocalForageInstance.prototype.clear = function clear() {
				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.clear().then(function success(keys) {
					deferred.resolve();
				}, function error(data) {
					self.onError(data, args, self.clear, deferred);
				});
				return deferred.promise;
			};

			// Return the key for item at position n
			LocalForageInstance.prototype.key = function key(n) {
				// throw error on undefined n
				if(angular.isUndefined(n)) {
					throw new Error("You must define a position to get for the key function");
				}

				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.key(n).then(function success(key) {
					deferred.resolve(key);
				}, function error(data) {
					self.onError(data, args, self.key, deferred);
				});
				return deferred.promise;
			};

			var keys = function keys() {
				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.keys().then(function success(keyList) {
					if(defaultConfig.oldPrefix && self.driver() === 'localStorageWrapper') {
						var tempKeyList = [];
						for(var i = 0, len = keyList.length; i < len; i++) {
							tempKeyList.push(keyList[i].substr(self.prefix().length, keyList[i].length));
						}
						keyList = tempKeyList;
					}
					deferred.resolve(keyList);
				}, function error(data) {
					self.onError(data, args, self.keys, deferred);
				});
				return deferred.promise;
			};

			// Return the list of keys stored for this application
			LocalForageInstance.prototype.keys = keys;

			// deprecated
			LocalForageInstance.prototype.getKeys = keys;

			// Returns the number of keys in this storage
			LocalForageInstance.prototype.length = function() {
				var deferred = $q.defer(),
					args = arguments,
					self = this;

				self._localforage.length().then(function success(length) {
					deferred.resolve(length);
				}, function error(data) {
					self.onError(data, args, length, deferred);
				});
				return deferred.promise;
			};

			/**
			 * Bind - let's you directly bind a LocalForage value to a $scope variable
			 * @param {Angular $scope} $scope - the current scope you want the variable available in
			 * @param {String/Object} opts - the key name of the variable you are binding OR an object with the key and custom options like default value or instance name
			 * Here are the available options you can set:
			 * * key: the key used in storage and in the scope (if scopeKey isn't defined)
			 * * defaultValue: the default value
			 * * name: name of the instance that should store the data
			 * * scopeKey: the key used in the scope
			 * @returns {*} - returns whatever the stored value is
			 */
			LocalForageInstance.prototype.bind = function bind($scope, opts) {
				if(angular.isString(opts)) {
					opts = {
						key: opts
					}
				} else if(!angular.isObject(opts) || angular.isUndefined(opts.key)) {
					throw new Error("You must define a key to bind");
				}

				var defaultOpts = {
					defaultValue: '',
					name: defaultConfig.name
				};

				// If no defined options we use defaults otherwise extend defaults
				opts = angular.extend({}, defaultOpts, opts);

				var self = lfInstances[opts.name];

				if(angular.isUndefined(self)) {
					throw new Error("You must use the name of an existing instance");
				}

				// Set the storeName key for the LocalForage entry
				// use user defined in specified
				var scopeKey = opts.scopeKey || opts.key,
					model = $parse(scopeKey);

				return self.getItem(opts.key).then(function(item) {
					if(item) { // If it does exist assign it to the $scope value
						model.assign($scope, item);
					} else if(opts.defaultValue) { // If a value doesn't already exist store it as is
						model.assign($scope, opts.defaultValue);
						self.setItem(opts.key, opts.defaultValue);
					}

					// Register a listener for changes on the $scope value
					// to update the localForage value
					if(angular.isDefined(watchers[opts.key])) {
						watchers[opts.key]();
					}

					watchers[opts.key] = $scope.$watch(scopeKey, function(val) {
						if(angular.isDefined(val)) {
							self.setItem(opts.key, val);
						}
					}, true);
					return item;
				});
			};

			/**
			 * Unbind - let's you unbind a variable from localForage while removing the value from both
			 * the localForage and the local variable and sets it to null
			 * @param {String/Object} opts - the key name of the variable you are unbinding OR an object with the key and custom options like default value or instance name
			 * Here are the available options you can set:
			 * * key: the key used in storage and in the scope (if scopeKey isn't defined)
			 * * name: name of the instance that should store the data
			 * * scopeKey: the key used in the scope
			 */
			LocalForageInstance.prototype.unbind = function unbind($scope, opts) {
				if(angular.isString(opts)) {
					opts = {
						key: opts
					}
				} else if(!angular.isObject(opts) || angular.isUndefined(opts.key)) {
					throw new Error("You must define a key to unbind");
				}

				var defaultOpts = {
					scopeKey: opts.key,
					name: defaultConfig.name
				};

				// If no defined options we use defaults otherwise extend defaults
				opts = angular.extend({}, defaultOpts, opts);

				var self = lfInstances[opts.name];

				if(angular.isUndefined(self)) {
					throw new Error("You must use the name of an existing instance");
				}

				$parse(opts.scopeKey).assign($scope, null);
				if(angular.isDefined(watchers[opts.key])) {
					watchers[opts.key](); // unwatch
					delete watchers[opts.key];
				}
				return self.removeItem(opts.key);
			};

			LocalForageInstance.prototype.prefix = function() {
				return this.driver() === 'localStorageWrapper' && defaultConfig.oldPrefix ? this._localforage.config().name + '.' : '';
			};

			// Handling errors
			LocalForageInstance.prototype.onError = function(err, args, fct, deferred) {
				// test for private browsing errors in Firefox & Safari
				if(((angular.isObject(err) && err.name ? err.name === 'InvalidStateError' : (angular.isString(err) && err === 'InvalidStateError')) && this.driver() === 'asyncStorage')
					|| (angular.isObject(err) && err.code && err.code === 5)) {
					var self = this;

					self.setDriver('localStorageWrapper').then(function() {
						fct.apply(self, args).then(function(item) {
							deferred.resolve(item);
						}, function(data) {
							deferred.reject(data);
						});
					}, function() {
						deferred.reject(err);
					});
				} else {
					deferred.reject(err);
				}
			};

			lfInstances[defaultConfig.name] = new LocalForageInstance();
			return lfInstances[defaultConfig.name];
		}]
	});

	angularLocalForage.directive('localForage', ['$localForage', function ($localForage) {
		return {
			restrict: 'A',
			link: function ($scope, $element, $attrs) {
				var opts = $scope.$eval($attrs.localForage);
				if(angular.isObject(opts) && angular.isDefined(opts.key)) {
					$localForage.bind($scope, opts);
				} else {
					$localForage.bind($scope, $attrs.localForage);
				}
			}
		}
	}]);
})(window, window.angular, window.localforage);
